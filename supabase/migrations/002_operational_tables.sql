-- ============================================================================
-- BookAgent Intelligence Engine — Tabelas Operacionais
-- Migration: 002_operational_tables.sql
-- Data: 2026-04-04 | Partes 49 + 50
-- ============================================================================
--
-- Tabelas gerenciadas pela camada n8n e pelo dashboard.
-- Complementam o schema core (001_initial_schema.sql).
--
-- Tabelas:
--   bookagent_job_meta      — canal, plano, estado de aprovação por job
--   bookagent_approvals     — histórico de decisões (intermediárias e finais)
--   bookagent_publications  — registros de publicação por plataforma
--   bookagent_comments      — histórico de comentários do usuário
--
-- View:
--   bookagent_jobs_dashboard — visão consolidada para o frontend
-- ============================================================================

-- Estados de aprovação (referência documentada):
--   pending                     → job criado, ainda não processado
--   processing                  → BookAgent executando pipeline
--   awaiting_intermediate_review → aguardando aprovação de prévia
--   intermediate_approved        → prévia aprovada, pipeline pode continuar
--   intermediate_rejected        → prévia reprovada, aguarda revisão
--   awaiting_final_review        → aguardando aprovação do pacote final
--   final_approved               → aprovado para entrega/publicação
--   final_rejected               → reprovado, aguarda nova rodada
--   published                    → publicado nas plataformas habilitadas
--   publish_failed               → falha na publicação (retry disponível)
--   failed                       → falha no processamento pelo BookAgent

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_job_meta
-- Criado pelo n8n (Fluxo 1 ou 2) imediatamente após receber o jobId.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookagent_job_meta (
  job_id           UUID PRIMARY KEY REFERENCES bookagent_jobs(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  plan_type        TEXT NOT NULL DEFAULT 'basic'
                     CHECK (plan_type IN ('basic', 'pro')),
  source_channel   TEXT NOT NULL DEFAULT 'api'
                     CHECK (source_channel IN ('whatsapp', 'dashboard', 'api')),
  auto_publish     BOOLEAN NOT NULL DEFAULT false,
  webhook_phone    TEXT,
  approval_status  TEXT NOT NULL DEFAULT 'pending'
                     CHECK (approval_status IN (
                       'pending', 'processing',
                       'awaiting_intermediate_review', 'intermediate_approved', 'intermediate_rejected',
                       'awaiting_final_review', 'final_approved', 'final_rejected',
                       'published', 'publish_failed', 'failed'
                     )),
  approval_round   INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_job_meta_user_id_idx
  ON bookagent_job_meta (user_id);
CREATE INDEX IF NOT EXISTS bookagent_job_meta_approval_status_idx
  ON bookagent_job_meta (approval_status);

DROP TRIGGER IF EXISTS bookagent_job_meta_updated_at ON bookagent_job_meta;
CREATE TRIGGER bookagent_job_meta_updated_at
  BEFORE UPDATE ON bookagent_job_meta
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_approvals
-- Cada linha = uma decisão do usuário (aprovação, rejeição ou comentário formal).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookagent_approvals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES bookagent_jobs(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  approval_type    TEXT NOT NULL DEFAULT 'final'
                     CHECK (approval_type IN ('intermediate', 'final')),
  decision         TEXT NOT NULL
                     CHECK (decision IN ('approved', 'rejected', 'comment', 'pending_review')),
  comment          TEXT,
  approval_round   INTEGER NOT NULL DEFAULT 1,
  source_channel   TEXT NOT NULL DEFAULT 'dashboard'
                     CHECK (source_channel IN ('whatsapp', 'dashboard')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_approvals_job_id_idx
  ON bookagent_approvals (job_id);
CREATE INDEX IF NOT EXISTS bookagent_approvals_user_id_idx
  ON bookagent_approvals (user_id);
CREATE INDEX IF NOT EXISTS bookagent_approvals_decision_idx
  ON bookagent_approvals (decision);

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_publications
-- Uma linha por plataforma por tentativa de publicação.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookagent_publications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES bookagent_jobs(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  platform         TEXT NOT NULL,
  artifact_id      UUID REFERENCES bookagent_job_artifacts(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'scheduled', 'published', 'failed')),
  platform_post_id TEXT,
  platform_url     TEXT,
  error            TEXT,
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_publications_job_id_idx
  ON bookagent_publications (job_id);
CREATE INDEX IF NOT EXISTS bookagent_publications_user_id_idx
  ON bookagent_publications (user_id);
CREATE INDEX IF NOT EXISTS bookagent_publications_platform_idx
  ON bookagent_publications (platform);

DROP TRIGGER IF EXISTS bookagent_publications_updated_at ON bookagent_publications;
CREATE TRIGGER bookagent_publications_updated_at
  BEFORE UPDATE ON bookagent_publications
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_comments
-- Histórico completo de mensagens do usuário (dashboard + WhatsApp).
-- Persiste tanto comentários formais (via aprovação) quanto mensagens livres.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookagent_comments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES bookagent_jobs(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  comment          TEXT NOT NULL,
  comment_type     TEXT NOT NULL DEFAULT 'general'
                     CHECK (comment_type IN ('general', 'intermediate', 'final')),
  source_channel   TEXT NOT NULL DEFAULT 'dashboard'
                     CHECK (source_channel IN ('whatsapp', 'dashboard')),
  approval_round   INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_comments_job_id_idx
  ON bookagent_comments (job_id);
CREATE INDEX IF NOT EXISTS bookagent_comments_user_id_idx
  ON bookagent_comments (user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE bookagent_job_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookagent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookagent_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookagent_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookagent_job_meta' AND policyname='service_role_all_job_meta') THEN
    CREATE POLICY "service_role_all_job_meta" ON bookagent_job_meta FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookagent_approvals' AND policyname='service_role_all_approvals') THEN
    CREATE POLICY "service_role_all_approvals" ON bookagent_approvals FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookagent_publications' AND policyname='service_role_all_publications') THEN
    CREATE POLICY "service_role_all_publications" ON bookagent_publications FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookagent_comments' AND policyname='service_role_all_comments') THEN
    CREATE POLICY "service_role_all_comments" ON bookagent_comments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- VIEW: bookagent_jobs_dashboard
-- Visão consolidada para o frontend — join de todas as tabelas operacionais.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW bookagent_jobs_dashboard AS
SELECT
  j.id                     AS job_id,
  j.status                 AS processing_status,
  j.input_type,
  j.user_context,
  j.sources_count,
  j.narratives_count,
  j.artifacts_count,
  j.pipeline_duration_ms,
  j.created_at,
  j.completed_at,
  j.error                  AS processing_error,
  -- meta operacional
  m.user_id,
  m.plan_type,
  m.source_channel,
  m.auto_publish,
  m.webhook_phone,
  m.approval_status,
  m.approval_round,
  -- última decisão
  la.decision              AS latest_decision,
  la.approval_type         AS latest_approval_type,
  la.comment               AS latest_comment,
  la.source_channel        AS latest_decision_channel,
  la.created_at            AS last_decision_at,
  -- publicações
  COUNT(p.id) FILTER (WHERE p.status = 'published') AS published_count,
  COUNT(p.id) FILTER (WHERE p.status = 'failed')    AS publish_failed_count,
  -- comentários
  COUNT(c.id) AS total_comments
FROM bookagent_jobs j
LEFT JOIN bookagent_job_meta m ON m.job_id = j.id
LEFT JOIN LATERAL (
  SELECT * FROM bookagent_approvals
  WHERE job_id = j.id
  ORDER BY created_at DESC
  LIMIT 1
) la ON true
LEFT JOIN bookagent_publications p ON p.job_id = j.id
LEFT JOIN bookagent_comments c ON c.job_id = j.id
GROUP BY
  j.id, j.status, j.input_type, j.user_context, j.sources_count,
  j.narratives_count, j.artifacts_count, j.pipeline_duration_ms,
  j.created_at, j.completed_at, j.error,
  m.user_id, m.plan_type, m.source_channel, m.auto_publish,
  m.webhook_phone, m.approval_status, m.approval_round,
  la.decision, la.approval_type, la.comment, la.source_channel, la.created_at;

COMMENT ON TABLE bookagent_job_meta IS
  'Metadados operacionais por job: canal de origem, plano, estado de aprovação. Gerenciado pelo n8n.';
COMMENT ON TABLE bookagent_approvals IS
  'Histórico de decisões intermediárias e finais por job. Cada linha = uma decisão do usuário.';
COMMENT ON TABLE bookagent_publications IS
  'Registros de publicação automática por plataforma. Plano Pro com auto_publish=true.';
COMMENT ON TABLE bookagent_comments IS
  'Histórico de comentários do usuário via dashboard e WhatsApp, por rodada de aprovação.';
