-- ============================================================================
-- BookAgent Intelligence Engine — Schema Inicial
-- Migration: 001_initial_schema.sql
-- Data: 2026-04-04
-- ============================================================================
--
-- Tabelas prefixadas com 'bookagent_' para coexistir com outros projetos
-- no mesmo projeto Supabase sem conflitos.
--
-- Para aplicar: execute este SQL no SQL Editor do Supabase Dashboard
-- ou via Supabase CLI: supabase db push
-- ============================================================================

-- ============================================================================
-- JOBS — Ciclo de vida dos jobs de processamento
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookagent_jobs (
  -- Identificação
  id                  UUID PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Input
  input_file_url      TEXT NOT NULL,
  input_type          TEXT NOT NULL,
  user_context        JSONB,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,

  -- Resultado
  error               TEXT,
  delivery_status     TEXT,
  sources_count       INTEGER NOT NULL DEFAULT 0,
  narratives_count    INTEGER NOT NULL DEFAULT 0,
  artifacts_count     INTEGER NOT NULL DEFAULT 0,
  pipeline_duration_ms INTEGER
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS bookagent_jobs_status_idx ON bookagent_jobs (status);
CREATE INDEX IF NOT EXISTS bookagent_jobs_created_at_idx ON bookagent_jobs (created_at DESC);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION bookagent_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookagent_jobs_updated_at ON bookagent_jobs;
CREATE TRIGGER bookagent_jobs_updated_at
  BEFORE UPDATE ON bookagent_jobs
  FOR EACH ROW
  EXECUTE FUNCTION bookagent_update_updated_at();

-- ============================================================================
-- JOB_EVENTS — Timeline de execução (stage por stage)
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookagent_job_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES bookagent_jobs(id) ON DELETE CASCADE,

  -- Módulo executado
  stage           TEXT NOT NULL,
  module_name     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed', 'failed', 'skipped')),

  -- Timing
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ NOT NULL,
  duration_ms     INTEGER NOT NULL DEFAULT 0,

  -- Resultado
  error           TEXT,
  metrics         JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_job_events_job_id_idx ON bookagent_job_events (job_id);
CREATE INDEX IF NOT EXISTS bookagent_job_events_stage_idx ON bookagent_job_events (stage);

-- ============================================================================
-- JOB_ARTIFACTS — Registro de artifacts gerados
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookagent_job_artifacts (
  id                      UUID PRIMARY KEY,
  job_id                  UUID NOT NULL REFERENCES bookagent_jobs(id) ON DELETE CASCADE,

  -- Tipo e formato
  artifact_type           TEXT NOT NULL,
  export_format           TEXT NOT NULL,
  output_format           TEXT,

  -- Conteúdo (referência, não o conteúdo em si)
  title                   TEXT NOT NULL,
  file_path               TEXT,
  size_bytes              INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'valid'
                            CHECK (status IN ('valid', 'partial', 'invalid')),

  -- Metadados
  warnings                JSONB NOT NULL DEFAULT '[]',
  referenced_asset_ids    JSONB NOT NULL DEFAULT '[]',

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_job_artifacts_job_id_idx ON bookagent_job_artifacts (job_id);
CREATE INDEX IF NOT EXISTS bookagent_job_artifacts_type_idx ON bookagent_job_artifacts (artifact_type);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Por padrão, habilitamos RLS mas com política permissiva para service role.
-- Em produção, refinar políticas por usuário/tenant.

ALTER TABLE bookagent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookagent_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookagent_job_artifacts ENABLE ROW LEVEL SECURITY;

-- Política: service role tem acesso total
CREATE POLICY IF NOT EXISTS "service_role_all_jobs"
  ON bookagent_jobs FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_all_events"
  ON bookagent_job_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_all_artifacts"
  ON bookagent_job_artifacts FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- VIEWS úteis para diagnóstico
-- ============================================================================

-- View: jobs com contagem de artifacts por status
CREATE OR REPLACE VIEW bookagent_jobs_summary AS
SELECT
  j.id,
  j.status,
  j.input_type,
  j.delivery_status,
  j.sources_count,
  j.narratives_count,
  j.artifacts_count,
  j.pipeline_duration_ms,
  j.created_at,
  j.completed_at,
  COUNT(a.id) FILTER (WHERE a.status = 'valid') AS valid_artifacts,
  COUNT(a.id) FILTER (WHERE a.status = 'partial') AS partial_artifacts,
  COUNT(a.id) FILTER (WHERE a.status = 'invalid') AS invalid_artifacts
FROM bookagent_jobs j
LEFT JOIN bookagent_job_artifacts a ON a.job_id = j.id
GROUP BY j.id;

-- ============================================================================
-- COMENTÁRIOS (documentação no banco)
-- ============================================================================
COMMENT ON TABLE bookagent_jobs IS
  'Jobs de processamento do BookAgent Intelligence Engine. '
  'Cada job representa um PDF sendo transformado em conteúdo digital.';

COMMENT ON TABLE bookagent_job_events IS
  'Timeline de execução por estágio de pipeline para cada job. '
  'Permite rastrear quanto tempo cada módulo levou.';

COMMENT ON TABLE bookagent_job_artifacts IS
  'Registro dos artifacts gerados (blog, landing page, render specs, metadata). '
  'file_path aponta para o arquivo em storage/outputs/. '
  'O conteúdo não é armazenado no banco — apenas metadados e caminho.';
