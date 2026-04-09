-- ============================================================================
-- BookAgent Intelligence Engine — Social Publish: Status + Content Type
-- Migration: 009_publications_social_publish.sql
-- Data: 2026-04-09
-- ============================================================================
--
-- Atualiza o CHECK constraint de status na bookagent_publications para
-- incluir os estados usados pelo publisher (publishing, retrying, queued, skipped).
--
-- Adiciona coluna content_type para rastrear tipo de mídia publicada.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Remover constraint antigo e adicionar novo com todos os estados
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE bookagent_publications
  DROP CONSTRAINT IF EXISTS bookagent_publications_status_check;

ALTER TABLE bookagent_publications
  ADD CONSTRAINT bookagent_publications_status_check
    CHECK (status IN (
      'pending',
      'queued',
      'publishing',
      'published',
      'failed',
      'retrying',
      'skipped',
      'scheduled'
    ));

-- ────────────────────────────────────────────────────────────────────────────
-- Coluna content_type (tipo de mídia: image, video, reel, text, carousel)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE bookagent_publications
  ADD COLUMN IF NOT EXISTS content_type TEXT;

COMMENT ON COLUMN bookagent_publications.content_type IS
  'Tipo de mídia publicada (image, video, reel, text, carousel).';

-- ────────────────────────────────────────────────────────────────────────────
-- Coluna post_url (alias de platform_url, para compatibilidade com service layer)
-- Não adicionar se platform_url já existe — são sinônimos.
-- ────────────────────────────────────────────────────────────────────────────

-- Nota: platform_url já existe em 002. O service layer usa post_url como alias.
-- Manter platform_url como coluna canônica. O código deve mapear post_url → platform_url.
