-- ============================================================================
-- BookAgent Intelligence Engine — Migration 012
-- Asset geometry fidelity — extensão aditiva de bookagent_job_artifacts
-- Aplicada em: 2026-04-15
--
-- Rationale:
--   Sprint 2A (fidelidade visual core) requer persistência de:
--     - coordenadas (x, y, width, height) do asset na página PDF
--     - z-index (ordem de pintura no operator list)
--     - CTM completa (para cálculos de rotação/skew futuros)
--     - color space detectado (DeviceRGB, DeviceCMYK, CalRGB, etc.)
--     - bits per component, hasAlpha
--     - flag de conversão de color space
--     - clipping path (quando disponível)
--
--   Decisão arquitetural: NÃO criar uma tabela `extracted_assets` nova.
--   A tabela canônica de assets no projeto é `bookagent_job_artifacts`,
--   criada em `000_consolidated_all.sql`. Duplicar seria regressão.
--
--   Em vez disso, adicionamos colunas opcionais a `bookagent_job_artifacts`:
--     - `asset_geometry JSONB` — `{x, y, width, height, zIndex, ctm, page}`
--     - `asset_image_metadata JSONB` — `{colorSpace, bitsPerComponent,
--                                        hasAlpha, interpolate}`
--     - `asset_composition JSONB` — `{isBackground, opacity, hasClipping,
--                                     clippingPath, stitchingGroupId,
--                                     stitchingPosition}`
--
--   JSONB é justificado aqui como *payload de metadados opcional* — o
--   estado de controle do pipeline NÃO vive nesses campos, e todas as
--   queries existentes permanecem válidas. Índices GIN opcionais podem
--   ser adicionados no futuro se houver consulta por estes campos.
--
--   Migração 100% aditiva. Linhas existentes ficam com NULL nos novos
--   campos e nenhum consumidor quebra.
-- ============================================================================

ALTER TABLE IF EXISTS bookagent_job_artifacts
  ADD COLUMN IF NOT EXISTS asset_geometry         JSONB,
  ADD COLUMN IF NOT EXISTS asset_image_metadata   JSONB,
  ADD COLUMN IF NOT EXISTS asset_composition      JSONB;

-- Índice parcial para acelerar queries de assets com geometria populada
-- (útil quando o validator de fidelidade quiser filtrar pela existência
-- dos dados enhanced).
CREATE INDEX IF NOT EXISTS bookagent_job_artifacts_has_geometry_idx
  ON bookagent_job_artifacts ((asset_geometry IS NOT NULL))
  WHERE asset_geometry IS NOT NULL;

-- Índice GIN para consulta por páginas ou z-index quando necessário.
-- Custa espaço — habilitado apenas se a tabela crescer para >100k rows
-- em produção. Por ora, comentado como referência.
-- CREATE INDEX IF NOT EXISTS bookagent_job_artifacts_geometry_gin_idx
--   ON bookagent_job_artifacts USING GIN (asset_geometry);

COMMENT ON COLUMN bookagent_job_artifacts.asset_geometry IS
  'Sprint 2A: PDFGeometry { x, y, width, height, zIndex, ctm, page }. NULL para assets sem extração enhanced.';
COMMENT ON COLUMN bookagent_job_artifacts.asset_image_metadata IS
  'Sprint 2A: { colorSpace, bitsPerComponent, hasAlpha, interpolate }. NULL para assets sem extração enhanced.';
COMMENT ON COLUMN bookagent_job_artifacts.asset_composition IS
  'Sprint 2A: { isBackground, opacity, hasClipping, clippingPath, stitchingGroupId, stitchingPosition }. NULL para assets sem extração enhanced.';
