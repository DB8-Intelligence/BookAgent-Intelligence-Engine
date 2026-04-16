-- ============================================================================
-- BookAgent Intelligence Engine — Migration 011
-- Adiciona o kind `manuscript` ao CHECK constraint de book_artifacts
-- Aplicada em: 2026-04-15
--
-- Rationale:
--   A camada de delivery editorial (DEV-9) consolida todos os chapter_draft
--   de um job em um único artefato `manuscript`. O `kind` canônico precisa
--   aceitar esse valor. Todas as outras colunas continuam idênticas.
--
--   Mudança não destrutiva: DROP + CREATE do CHECK. Linhas existentes
--   (intake_brief, market_report, etc.) continuam válidas.
-- ============================================================================

ALTER TABLE book_artifacts DROP CONSTRAINT IF EXISTS book_artifacts_kind_check;

ALTER TABLE book_artifacts ADD CONSTRAINT book_artifacts_kind_check
  CHECK (kind IN (
    'intake_brief',
    'market_report',
    'theme_decision',
    'book_dna',
    'outline',
    'chapter_draft',
    'qa_report',
    'manuscript'
  ));
