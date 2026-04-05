-- ============================================================================
-- BookAgent Intelligence Engine — Growth Monitoring
-- Migration: 006_growth_monitoring.sql
-- Data: 2026-04-04 | Parte 57
-- ============================================================================
--
-- Views e índices para monitoramento de crescimento e escala.
-- Suporta o dashboard operacional (GET /api/v1/ops/dashboard).
--
-- Componentes:
--   VIEW bookagent_jobs_hourly     — jobs por hora (detectar pico)
--   VIEW bookagent_cost_by_user    — custo estimado por usuário
--   VIEW bookagent_system_health   — métricas gerais de saúde
--   INDEX em usage_metrics         — performance para queries de crescimento
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- VIEW: bookagent_jobs_hourly
-- Jobs por hora nos últimos 7 dias — detecta picos de uso
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW bookagent_jobs_hourly AS
SELECT
  DATE_TRUNC('hour', created_at) AS hora,
  COUNT(*) AS total_jobs,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(AVG(
    CASE WHEN status = 'completed'
      THEN EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000
    END
  ), 0) AS avg_duration_ms
FROM bookagent_jobs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW bookagent_jobs_hourly IS
  'Jobs agrupados por hora nos últimos 7 dias. Detecta picos para decisão de escala de workers.';

-- ────────────────────────────────────────────────────────────────────────────
-- VIEW: bookagent_cost_by_user
-- Custo estimado mensal por usuário (baseado em plan_tier e jobs)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW bookagent_cost_by_user AS
SELECT
  jm.user_id,
  COALESCE(jm.plan_type, 'basic') AS plan_tier,
  COUNT(j.id) AS jobs_this_month,
  COUNT(j.id) * CASE COALESCE(jm.plan_type, 'basic')
    WHEN 'basic'    THEN 850
    WHEN 'pro'      THEN 1200
    WHEN 'business' THEN 1500
    ELSE 850
  END AS estimated_cost_centavos,
  CASE COALESCE(jm.plan_type, 'basic')
    WHEN 'basic'    THEN 9700
    WHEN 'pro'      THEN 24700
    WHEN 'business' THEN 99700
    ELSE 9700
  END AS plan_revenue_centavos,
  CASE COALESCE(jm.plan_type, 'basic')
    WHEN 'basic'    THEN 9700
    WHEN 'pro'      THEN 24700
    WHEN 'business' THEN 99700
    ELSE 9700
  END - COUNT(j.id) * CASE COALESCE(jm.plan_type, 'basic')
    WHEN 'basic'    THEN 850
    WHEN 'pro'      THEN 1200
    WHEN 'business' THEN 1500
    ELSE 850
  END AS estimated_margin_centavos
FROM bookagent_jobs j
JOIN bookagent_job_meta jm ON j.id = jm.job_id
WHERE j.created_at >= DATE_TRUNC('month', NOW())
GROUP BY jm.user_id, jm.plan_type;

COMMENT ON VIEW bookagent_cost_by_user IS
  'Custo estimado e margem por usuário no mês corrente. Valores em centavos BRL.';

-- ────────────────────────────────────────────────────────────────────────────
-- VIEW: bookagent_system_health
-- Métricas gerais de saúde do sistema
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW bookagent_system_health AS
SELECT
  (SELECT COUNT(DISTINCT jm.user_id)
   FROM bookagent_job_meta jm
   JOIN bookagent_jobs j ON j.id = jm.job_id
   WHERE j.created_at >= NOW() - INTERVAL '30 days'
  ) AS active_users_30d,

  (SELECT COUNT(*)
   FROM bookagent_jobs
   WHERE created_at >= DATE_TRUNC('month', NOW())
  ) AS jobs_this_month,

  (SELECT COUNT(*)
   FROM bookagent_jobs
   WHERE created_at >= NOW() - INTERVAL '24 hours'
  ) AS jobs_last_24h,

  (SELECT ROUND(AVG(
     EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000
   ), 0)
   FROM bookagent_jobs
   WHERE status = 'completed'
     AND created_at >= NOW() - INTERVAL '7 days'
  ) AS avg_duration_ms_7d,

  (SELECT ROUND(
     100.0 * COUNT(*) FILTER (WHERE status = 'failed') /
     NULLIF(COUNT(*), 0), 1
   )
   FROM bookagent_jobs
   WHERE created_at >= NOW() - INTERVAL '7 days'
  ) AS error_rate_pct_7d,

  (SELECT COUNT(*)
   FROM bookagent_leads
   WHERE created_at >= DATE_TRUNC('month', NOW())
  ) AS new_leads_this_month,

  (SELECT COUNT(*)
   FROM bookagent_leads
   WHERE converted_at IS NOT NULL
     AND converted_at >= DATE_TRUNC('month', NOW())
  ) AS conversions_this_month;

COMMENT ON VIEW bookagent_system_health IS
  'Métricas gerais de saúde do sistema. Uma linha com contadores e médias dos últimos 7-30 dias.';

-- ────────────────────────────────────────────────────────────────────────────
-- Indices para queries de crescimento
-- ────────────────────────────────────────────────────────────────────────────

-- Acesso rápido a métricas por evento e data
CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_event_created_idx
  ON bookagent_usage_metrics (event, created_at DESC);

-- Acesso rápido a métricas por usuário e mês
CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_user_month_idx
  ON bookagent_usage_metrics (user_id, created_at DESC);

-- Jobs por status e data (para views de saúde)
CREATE INDEX IF NOT EXISTS bookagent_jobs_status_created_idx
  ON bookagent_jobs (status, created_at DESC);
