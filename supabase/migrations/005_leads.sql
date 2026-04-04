-- ============================================================================
-- BookAgent Intelligence Engine — Lead Tracking
-- Migration: 005_leads.sql
-- Data: 2026-04-04 | Parte 56
-- ============================================================================
--
-- bookagent_leads: rastreia cada lead desde o primeiro contato até conversão.
-- Alimentado pelo Fluxo 7 do n8n (primeiro contato via WhatsApp).
--
-- Estágios do lead:
--   new         → primeiro contato recebido
--   demo_sent   → instruções enviadas (aguardando PDF)
--   demo_processing → PDF enviado, BookAgent processando
--   demo_delivered  → resultado entregue ao lead
--   offer_sent  → mensagem de conversão enviada
--   converted   → assinou um plano
--   lost        → não respondeu ou recusou após follow-up completo
--   reactivated → retornou após período inativo
-- ============================================================================

CREATE TABLE IF NOT EXISTS bookagent_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL UNIQUE,    -- número no formato Evolution API (55119...)
  name            TEXT,
  source          TEXT NOT NULL DEFAULT 'whatsapp'
                    CHECK (source IN ('whatsapp', 'instagram', 'direct', 'referral')),
  stage           TEXT NOT NULL DEFAULT 'new'
                    CHECK (stage IN (
                      'new', 'demo_sent', 'demo_processing',
                      'demo_delivered', 'offer_sent', 'converted', 'lost', 'reactivated'
                    )),
  -- Contadores
  demos_used      INTEGER NOT NULL DEFAULT 0,
  demos_limit     INTEGER NOT NULL DEFAULT 3,  -- trial: 3 demos grátis
  -- Conversão
  plan_tier       TEXT CHECK (plan_tier IN ('basic', 'pro', 'business')),
  converted_at    TIMESTAMPTZ,
  -- Rastreamento de tempo por etapa
  first_contact_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  demo_sent_at      TIMESTAMPTZ,
  demo_delivered_at TIMESTAMPTZ,
  offer_sent_at     TIMESTAMPTZ,
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Referência ao job da demo
  last_job_id     UUID REFERENCES bookagent_jobs(id) ON DELETE SET NULL,
  -- Metadados
  notes           TEXT,
  utm_source      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS bookagent_leads_stage_idx
  ON bookagent_leads (stage, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS bookagent_leads_phone_idx
  ON bookagent_leads (phone);

CREATE INDEX IF NOT EXISTS bookagent_leads_converted_idx
  ON bookagent_leads (converted_at)
  WHERE converted_at IS NOT NULL;

-- Trigger updated_at
DROP TRIGGER IF EXISTS bookagent_leads_updated_at ON bookagent_leads;
CREATE TRIGGER bookagent_leads_updated_at
  BEFORE UPDATE ON bookagent_leads
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

COMMENT ON TABLE bookagent_leads IS
  'Rastreamento de leads desde o primeiro contato até conversão. Alimentado pelo Fluxo 7 n8n.';

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_lead_events
-- Log de cada interação com o lead (mensagem enviada, resposta recebida, etc.)
-- Útil para auditoria e personalização de follow-up
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookagent_lead_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES bookagent_leads(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL
                CHECK (event_type IN (
                  'message_received', 'message_sent', 'pdf_received',
                  'demo_completed', 'offer_sent', 'follow_up_sent',
                  'converted', 'opted_out', 'reactivated'
                )),
  direction   TEXT CHECK (direction IN ('inbound', 'outbound')),
  content     TEXT,             -- resumo da mensagem (não armazenar dados sensíveis)
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_lead_events_lead_id_idx
  ON bookagent_lead_events (lead_id, created_at DESC);

COMMENT ON TABLE bookagent_lead_events IS
  'Log de interações com leads. Permite reconstruir a jornada completa de um lead.';

-- ────────────────────────────────────────────────────────────────────────────
-- VIEW: bookagent_funnel_summary
-- Visão do funil por etapa — para monitoramento do operador
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW bookagent_funnel_summary AS
SELECT
  stage,
  COUNT(*)                                                          AS total,
  COUNT(*) FILTER (WHERE last_activity_at > NOW() - INTERVAL '7 days') AS active_last_7d,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE converted_at IS NOT NULL) /
    NULLIF(COUNT(*), 0), 1
  )                                                                 AS conversion_rate_pct,
  ROUND(AVG(
    EXTRACT(EPOCH FROM (
      COALESCE(converted_at, last_activity_at) - first_contact_at
    )) / 3600
  ), 1)                                                             AS avg_hours_in_stage
FROM bookagent_leads
GROUP BY stage
ORDER BY
  CASE stage
    WHEN 'new' THEN 1
    WHEN 'demo_sent' THEN 2
    WHEN 'demo_processing' THEN 3
    WHEN 'demo_delivered' THEN 4
    WHEN 'offer_sent' THEN 5
    WHEN 'converted' THEN 6
    WHEN 'reactivated' THEN 7
    WHEN 'lost' THEN 8
  END;

COMMENT ON VIEW bookagent_funnel_summary IS
  'Visão resumida do funil de vendas por etapa. Atualizada em tempo real.';
