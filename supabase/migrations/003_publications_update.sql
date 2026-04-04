-- ============================================================================
-- BookAgent Intelligence Engine — Publications: Payload & Retry Tracking
-- Migration: 003_publications_update.sql
-- Data: 2026-04-04 | Parte 51
-- ============================================================================
--
-- Adiciona rastreabilidade de publicação ao bookagent_publications:
--   payload          — corpo exato enviado à plataforma (para diagnóstico)
--   response_metadata — resposta bruta da API da plataforma
--   attempt_count    — contador de tentativas (para retry)
--
-- Também adiciona coluna content_type à bookagent_job_artifacts
-- para distinguir artifacts com URL pública (para Instagram) de locais.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_publications: colunas de rastreabilidade
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE bookagent_publications
  ADD COLUMN IF NOT EXISTS payload          JSONB,
  ADD COLUMN IF NOT EXISTS response_metadata JSONB,
  ADD COLUMN IF NOT EXISTS attempt_count    INTEGER NOT NULL DEFAULT 0;

-- Índice para facilitar busca de publicações com falha (para retry)
CREATE INDEX IF NOT EXISTS bookagent_publications_status_job_idx
  ON bookagent_publications (job_id, status);

-- ────────────────────────────────────────────────────────────────────────────
-- bookagent_job_artifacts: adicionar content_url
-- Artifacts podem ter URL pública (CDN/storage) além do file_path local.
-- Necessário para Instagram (exige URL acessível publicamente).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE bookagent_job_artifacts
  ADD COLUMN IF NOT EXISTS content_url TEXT,
  ADD COLUMN IF NOT EXISTS content     JSONB;

COMMENT ON COLUMN bookagent_job_artifacts.content_url IS
  'URL pública do artifact (CDN, storage). Necessária para Instagram Graph API.';

COMMENT ON COLUMN bookagent_job_artifacts.content IS
  'Conteúdo do artifact em JSONB. Populado para artifacts do tipo media-metadata.';

COMMENT ON COLUMN bookagent_publications.payload IS
  'Payload exato enviado à plataforma. Útil para diagnóstico e retry.';

COMMENT ON COLUMN bookagent_publications.response_metadata IS
  'Resposta bruta da API da plataforma (platform_post_id, erros, etc.).';

COMMENT ON COLUMN bookagent_publications.attempt_count IS
  'Número de tentativas de publicação nesta linha. Incrementado a cada retry.';
