-- ============================================================================
-- BookAgent Intelligence Engine — Usage Metrics & Plan Tracking
-- Migration: 004_usage_metrics.sql
-- Data: 2026-04-04 | Parte 55
-- ============================================================================
--
-- bookagent_usage_metrics: rastreamento de eventos por usuário/plano
--   Alimentado pelo MetricsTracker (src/observability/metrics.ts)
--   Usado para: analytics, controle de margem, alertas de abuso, billing futuro
--
-- bookagent_plan_overrides: sobrescrever plano por usuário sem alterar bookagent_job_meta
--   Permite upgrade manual sem reprocessar todos os registros históricos
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_usage_metrics
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookagent_usage_metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event        TEXT NOT NULL
                 CHECK (event IN (
                   'job_started', 'job_completed', 'job_failed',
                   'publish_attempt', 'approval_action'
                 )),
  user_id      TEXT NOT NULL,
  plan_tier    TEXT NOT NULL DEFAULT 'basic'
                 CHECK (plan_tier IN ('basic', 'pro', 'business')),
  job_id       UUID REFERENCES bookagent_jobs(id) ON DELETE SET NULL,
  duration_ms  INTEGER,
  error_code   TEXT,
  platform     TEXT,
  success      BOOLEAN,
  decision     TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para queries de analytics e billing
CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_user_id_idx
  ON bookagent_usage_metrics (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_event_plan_idx
  ON bookagent_usage_metrics (event, plan_tier, created_at DESC);

CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_job_id_idx
  ON bookagent_usage_metrics (job_id)
  WHERE job_id IS NOT NULL;

COMMENT ON TABLE bookagent_usage_metrics IS
  'Eventos de uso por usuário. Fonte primária para analytics, billing e controle de margem.';

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_plan_overrides
-- Permite atribuir plano a um usuário sem depender de bookagent_job_meta
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookagent_plan_overrides (
  user_id      TEXT PRIMARY KEY,
  plan_tier    TEXT NOT NULL DEFAULT 'basic'
                 CHECK (plan_tier IN ('basic', 'pro', 'business')),
  valid_until  TIMESTAMPTZ,           -- NULL = sem expiração
  notes        TEXT,                  -- ex: "piloto gratuito até 2026-05-01"
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS bookagent_plan_overrides_updated_at ON bookagent_plan_overrides;
CREATE TRIGGER bookagent_plan_overrides_updated_at
  BEFORE UPDATE ON bookagent_plan_overrides
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

COMMENT ON TABLE bookagent_plan_overrides IS
  'Atribuição manual de plano por usuário. Sobrescreve o plano inferido de bookagent_job_meta.';

-- ────────────────────────────────────────────────────────────────────────────
-- VIEW: bookagent_monthly_usage
-- Resumo de uso por usuário no mês corrente — para billing e monitoramento
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW bookagent_monthly_usage AS
SELECT
  m.user_id,
  COALESCE(po.plan_tier, 'basic')            AS plan_tier,
  DATE_TRUNC('month', NOW())                  AS month,
  COUNT(*) FILTER (WHERE m.event = 'job_started')    AS jobs_started,
  COUNT(*) FILTER (WHERE m.event = 'job_completed')  AS jobs_completed,
  COUNT(*) FILTER (WHERE m.event = 'job_failed')     AS jobs_failed,
  COUNT(*) FILTER (WHERE m.event = 'publish_attempt' AND m.success = true)  AS publishes_success,
  COUNT(*) FILTER (WHERE m.event = 'publish_attempt' AND m.success = false) AS publishes_failed,
  ROUND(AVG(m.duration_ms) FILTER (WHERE m.event = 'job_completed'))::INTEGER AS avg_duration_ms
FROM bookagent_usage_metrics m
LEFT JOIN bookagent_plan_overrides po ON po.user_id = m.user_id
WHERE m.created_at >= DATE_TRUNC('month', NOW())
GROUP BY m.user_id, po.plan_tier;

COMMENT ON VIEW bookagent_monthly_usage IS
  'Resumo de uso por usuário no mês corrente. Atualizado em tempo real.';

-- ────────────────────────────────────────────────────────────────────────────
-- VIEW: bookagent_revenue_estimate
-- Estimativa de receita e margem por plano — para gestão operacional
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW bookagent_revenue_estimate AS
SELECT
  mu.plan_tier,
  COUNT(DISTINCT mu.user_id)                        AS active_users,
  SUM(mu.jobs_started)                              AS total_jobs,
  -- Preços em centavos BRL: basic=9700, pro=24700, business=99700
  SUM(CASE mu.plan_tier
    WHEN 'basic'    THEN 9700
    WHEN 'pro'      THEN 24700
    WHEN 'business' THEN 99700
    ELSE 9700
  END)                                               AS gross_revenue_brl_cents,
  -- Custo estimado: basic=850/job, pro=1200/job, business=1500/job
  SUM(CASE mu.plan_tier
    WHEN 'basic'    THEN mu.jobs_started * 850
    WHEN 'pro'      THEN mu.jobs_started * 1200
    WHEN 'business' THEN mu.jobs_started * 1500
    ELSE mu.jobs_started * 850
  END)                                               AS estimated_cost_brl_cents
FROM bookagent_monthly_usage mu
GROUP BY mu.plan_tier;

COMMENT ON VIEW bookagent_revenue_estimate IS
  'Estimativa de receita bruta e custo operacional por plano no mês corrente.';
