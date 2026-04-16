-- ============================================================================
-- BookAgent Intelligence Engine — Migration 010
-- Editorial book-production pipeline: book_jobs, book_job_steps,
-- book_artifacts, book_approval_rounds
-- Aplicada em: 2026-04-15
--
-- Rationale:
--   Pipeline editorial multi-step (intake → market_analysis → theme_validation
--   → book_dna → outline → chapter_writing → editorial_qa) não cabe no
--   orchestrator síncrono existente (bookagent_jobs). Criamos um bounded
--   context paralelo com prefixo "book_" para separação clara, reutilizando
--   a mesma infra BullMQ/Supabase/tenant do projeto.
--
--   Estado é normalizado em colunas próprias — JSONB é usado apenas para
--   payloads (metadata de input, content de artifact, metrics de step),
--   NUNCA como fonte única de verdade de estado de controle.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- book_jobs — 1 linha por job editorial
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID,
  user_id          TEXT,
  title            TEXT NOT NULL,
  brief            TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft',
                       'queued',
                       'running',
                       'awaiting_approval',
                       'approved',
                       'rejected',
                       'completed',
                       'failed',
                       'cancelled'
                     )),
  current_step     TEXT,
  progress         INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  total_steps      INTEGER NOT NULL DEFAULT 0,
  completed_steps  INTEGER NOT NULL DEFAULT 0,
  metadata         JSONB NOT NULL DEFAULT '{}',
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS book_jobs_status_idx       ON book_jobs (status);
CREATE INDEX IF NOT EXISTS book_jobs_tenant_idx       ON book_jobs (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS book_jobs_user_idx         ON book_jobs (user_id)   WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS book_jobs_created_at_idx   ON book_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS book_jobs_awaiting_idx     ON book_jobs (status, updated_at) WHERE status = 'awaiting_approval';

-- ----------------------------------------------------------------------------
-- book_job_steps — 1 linha por tentativa de cada step (suporta reexecução)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_job_steps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES book_jobs(id) ON DELETE CASCADE,
  step_name        TEXT NOT NULL
                     CHECK (step_name IN (
                       'intake',
                       'market_analysis',
                       'theme_validation',
                       'book_dna',
                       'outline',
                       'chapter_writing',
                       'editorial_qa'
                     )),
  step_index       INTEGER NOT NULL,
  attempt          INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  duration_ms      INTEGER,
  error            TEXT,
  input_ref        JSONB NOT NULL DEFAULT '{}',
  metrics          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS book_job_steps_attempt_key
  ON book_job_steps (job_id, step_name, attempt);
CREATE INDEX IF NOT EXISTS book_job_steps_job_idx      ON book_job_steps (job_id, step_index);
CREATE INDEX IF NOT EXISTS book_job_steps_status_idx   ON book_job_steps (status);
CREATE INDEX IF NOT EXISTS book_job_steps_running_idx  ON book_job_steps (status, started_at) WHERE status = 'running';

-- ----------------------------------------------------------------------------
-- book_artifacts — outputs estruturados de cada step
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_artifacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES book_jobs(id) ON DELETE CASCADE,
  step_id          UUID REFERENCES book_job_steps(id) ON DELETE SET NULL,
  step_name        TEXT NOT NULL,
  kind             TEXT NOT NULL
                     CHECK (kind IN (
                       'intake_brief',
                       'market_report',
                       'theme_decision',
                       'book_dna',
                       'outline',
                       'chapter_draft',
                       'qa_report'
                     )),
  version          INTEGER NOT NULL DEFAULT 1,
  title            TEXT,
  content          JSONB NOT NULL DEFAULT '{}',
  content_url      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS book_artifacts_job_idx        ON book_artifacts (job_id, created_at);
CREATE INDEX IF NOT EXISTS book_artifacts_step_idx       ON book_artifacts (step_id) WHERE step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS book_artifacts_kind_idx       ON book_artifacts (job_id, kind);
CREATE INDEX IF NOT EXISTS book_artifacts_step_name_idx  ON book_artifacts (job_id, step_name);

-- ----------------------------------------------------------------------------
-- book_approval_rounds — gates de aprovação humana
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_approval_rounds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES book_jobs(id) ON DELETE CASCADE,
  step_name        TEXT NOT NULL,
  round            INTEGER NOT NULL DEFAULT 1,
  kind             TEXT NOT NULL DEFAULT 'intermediate'
                     CHECK (kind IN ('intermediate', 'final')),
  decision         TEXT NOT NULL DEFAULT 'pending'
                     CHECK (decision IN ('pending', 'approved', 'rejected', 'changes_requested')),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at       TIMESTAMPTZ,
  decided_by       TEXT,
  comment          TEXT,
  artifact_ref     UUID REFERENCES book_artifacts(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS book_approval_rounds_key
  ON book_approval_rounds (job_id, step_name, round);
CREATE INDEX IF NOT EXISTS book_approval_rounds_pending_idx
  ON book_approval_rounds (decision, requested_at) WHERE decision = 'pending';

-- ----------------------------------------------------------------------------
-- Triggers: reutiliza a função bookagent_update_timestamp() existente.
-- Função criada em migration 008; criamos aqui IF NOT EXISTS para idempotência
-- caso esta migration rode isolada.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bookagent_update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS book_jobs_updated_at ON book_jobs;
CREATE TRIGGER book_jobs_updated_at
  BEFORE UPDATE ON book_jobs
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_timestamp();

DROP TRIGGER IF EXISTS book_job_steps_updated_at ON book_job_steps;
CREATE TRIGGER book_job_steps_updated_at
  BEFORE UPDATE ON book_job_steps
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_timestamp();

DROP TRIGGER IF EXISTS book_approval_rounds_updated_at ON book_approval_rounds;
CREATE TRIGGER book_approval_rounds_updated_at
  BEFORE UPDATE ON book_approval_rounds
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_timestamp();

-- ----------------------------------------------------------------------------
-- RLS: segue o padrão do projeto (service_role tem acesso total).
-- Tenant isolation fica na camada de aplicação (tenant_id explícito nas queries).
-- ----------------------------------------------------------------------------
ALTER TABLE book_jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_job_steps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_artifacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_approval_rounds  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_book_jobs            ON book_jobs;
DROP POLICY IF EXISTS service_role_all_book_job_steps       ON book_job_steps;
DROP POLICY IF EXISTS service_role_all_book_artifacts       ON book_artifacts;
DROP POLICY IF EXISTS service_role_all_book_approval_rounds ON book_approval_rounds;

CREATE POLICY service_role_all_book_jobs            ON book_jobs            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_book_job_steps       ON book_job_steps       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_book_artifacts       ON book_artifacts       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_book_approval_rounds ON book_approval_rounds FOR ALL TO service_role USING (true) WITH CHECK (true);
