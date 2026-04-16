-- ============================================================================
-- BookAgent Intelligence Engine — CONSOLIDATED MIGRATIONS
-- All 9 migrations in a single file for manual execution
-- Execute this in Supabase SQL Editor (Dashboard → SQL → New Query)
-- ============================================================================
-- IMPORTANT: Run this ONCE. All statements use IF NOT EXISTS / IF EXISTS
-- to be idempotent. Safe to re-run if needed.
-- ============================================================================

-- ============================================================================
-- MIGRATION 001: Initial Schema
-- ============================================================================

CREATE TABLE IF NOT EXISTS bookagent_jobs (
  id                  UUID PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  input_file_url      TEXT NOT NULL,
  input_type          TEXT NOT NULL,
  user_context        JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  error               TEXT,
  delivery_status     TEXT,
  sources_count       INTEGER NOT NULL DEFAULT 0,
  narratives_count    INTEGER NOT NULL DEFAULT 0,
  artifacts_count     INTEGER NOT NULL DEFAULT 0,
  pipeline_duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS bookagent_jobs_status_idx ON bookagent_jobs (status);
CREATE INDEX IF NOT EXISTS bookagent_jobs_created_at_idx ON bookagent_jobs (created_at DESC);

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

CREATE TABLE IF NOT EXISTS bookagent_job_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES bookagent_jobs(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL,
  module_name     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed', 'failed', 'skipped')),
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ NOT NULL,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  metrics         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_job_events_job_id_idx ON bookagent_job_events (job_id);
CREATE INDEX IF NOT EXISTS bookagent_job_events_stage_idx ON bookagent_job_events (stage);

CREATE TABLE IF NOT EXISTS bookagent_job_artifacts (
  id                      UUID PRIMARY KEY,
  job_id                  UUID NOT NULL REFERENCES bookagent_jobs(id) ON DELETE CASCADE,
  artifact_type           TEXT NOT NULL,
  export_format           TEXT NOT NULL,
  output_format           TEXT,
  title                   TEXT NOT NULL,
  file_path               TEXT,
  size_bytes              INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'valid'
                            CHECK (status IN ('valid', 'partial', 'invalid')),
  warnings                JSONB NOT NULL DEFAULT '[]',
  referenced_asset_ids    JSONB NOT NULL DEFAULT '[]',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_job_artifacts_job_id_idx ON bookagent_job_artifacts (job_id);
CREATE INDEX IF NOT EXISTS bookagent_job_artifacts_type_idx ON bookagent_job_artifacts (artifact_type);

-- RLS for core tables
ALTER TABLE bookagent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookagent_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookagent_job_artifacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookagent_jobs' AND policyname='service_role_all_jobs') THEN
    CREATE POLICY "service_role_all_jobs" ON bookagent_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookagent_job_events' AND policyname='service_role_all_events') THEN
    CREATE POLICY "service_role_all_events" ON bookagent_job_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookagent_job_artifacts' AND policyname='service_role_all_artifacts') THEN
    CREATE POLICY "service_role_all_artifacts" ON bookagent_job_artifacts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

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

COMMENT ON TABLE bookagent_jobs IS 'Jobs de processamento do BookAgent Intelligence Engine.';
COMMENT ON TABLE bookagent_job_events IS 'Timeline de execução por estágio de pipeline para cada job.';
COMMENT ON TABLE bookagent_job_artifacts IS 'Registro dos artifacts gerados.';

-- ============================================================================
-- MIGRATION 002: Operational Tables
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS bookagent_job_meta_user_id_idx ON bookagent_job_meta (user_id);
CREATE INDEX IF NOT EXISTS bookagent_job_meta_approval_status_idx ON bookagent_job_meta (approval_status);

DROP TRIGGER IF EXISTS bookagent_job_meta_updated_at ON bookagent_job_meta;
CREATE TRIGGER bookagent_job_meta_updated_at
  BEFORE UPDATE ON bookagent_job_meta
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

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

CREATE INDEX IF NOT EXISTS bookagent_approvals_job_id_idx ON bookagent_approvals (job_id);
CREATE INDEX IF NOT EXISTS bookagent_approvals_user_id_idx ON bookagent_approvals (user_id);
CREATE INDEX IF NOT EXISTS bookagent_approvals_decision_idx ON bookagent_approvals (decision);

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

CREATE INDEX IF NOT EXISTS bookagent_publications_job_id_idx ON bookagent_publications (job_id);
CREATE INDEX IF NOT EXISTS bookagent_publications_user_id_idx ON bookagent_publications (user_id);
CREATE INDEX IF NOT EXISTS bookagent_publications_platform_idx ON bookagent_publications (platform);

DROP TRIGGER IF EXISTS bookagent_publications_updated_at ON bookagent_publications;
CREATE TRIGGER bookagent_publications_updated_at
  BEFORE UPDATE ON bookagent_publications
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

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

CREATE INDEX IF NOT EXISTS bookagent_comments_job_id_idx ON bookagent_comments (job_id);
CREATE INDEX IF NOT EXISTS bookagent_comments_user_id_idx ON bookagent_comments (user_id);

-- RLS for operational tables
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

CREATE OR REPLACE VIEW bookagent_jobs_dashboard AS
SELECT
  j.id AS job_id, j.status AS processing_status, j.input_type, j.user_context,
  j.sources_count, j.narratives_count, j.artifacts_count, j.pipeline_duration_ms,
  j.created_at, j.completed_at, j.error AS processing_error,
  m.user_id, m.plan_type, m.source_channel, m.auto_publish, m.webhook_phone,
  m.approval_status, m.approval_round,
  la.decision AS latest_decision, la.approval_type AS latest_approval_type,
  la.comment AS latest_comment, la.source_channel AS latest_decision_channel,
  la.created_at AS last_decision_at,
  COUNT(p.id) FILTER (WHERE p.status = 'published') AS published_count,
  COUNT(p.id) FILTER (WHERE p.status = 'failed') AS publish_failed_count,
  COUNT(c.id) AS total_comments
FROM bookagent_jobs j
LEFT JOIN bookagent_job_meta m ON m.job_id = j.id
LEFT JOIN LATERAL (
  SELECT * FROM bookagent_approvals WHERE job_id = j.id ORDER BY created_at DESC LIMIT 1
) la ON true
LEFT JOIN bookagent_publications p ON p.job_id = j.id
LEFT JOIN bookagent_comments c ON c.job_id = j.id
GROUP BY j.id, j.status, j.input_type, j.user_context, j.sources_count,
  j.narratives_count, j.artifacts_count, j.pipeline_duration_ms,
  j.created_at, j.completed_at, j.error,
  m.user_id, m.plan_type, m.source_channel, m.auto_publish,
  m.webhook_phone, m.approval_status, m.approval_round,
  la.decision, la.approval_type, la.comment, la.source_channel, la.created_at;

-- ============================================================================
-- MIGRATION 003: Publications Update
-- ============================================================================

ALTER TABLE bookagent_publications
  ADD COLUMN IF NOT EXISTS payload          JSONB,
  ADD COLUMN IF NOT EXISTS response_metadata JSONB,
  ADD COLUMN IF NOT EXISTS attempt_count    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS bookagent_publications_status_job_idx
  ON bookagent_publications (job_id, status);

ALTER TABLE bookagent_job_artifacts
  ADD COLUMN IF NOT EXISTS content_url TEXT,
  ADD COLUMN IF NOT EXISTS content     JSONB;

-- ============================================================================
-- MIGRATION 004: Usage Metrics
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_user_id_idx
  ON bookagent_usage_metrics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_event_plan_idx
  ON bookagent_usage_metrics (event, plan_tier, created_at DESC);
CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_job_id_idx
  ON bookagent_usage_metrics (job_id) WHERE job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookagent_plan_overrides (
  user_id      TEXT PRIMARY KEY,
  plan_tier    TEXT NOT NULL DEFAULT 'basic'
                 CHECK (plan_tier IN ('basic', 'pro', 'business')),
  valid_until  TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS bookagent_plan_overrides_updated_at ON bookagent_plan_overrides;
CREATE TRIGGER bookagent_plan_overrides_updated_at
  BEFORE UPDATE ON bookagent_plan_overrides
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

CREATE OR REPLACE VIEW bookagent_monthly_usage AS
SELECT
  m.user_id,
  COALESCE(po.plan_tier, 'basic') AS plan_tier,
  DATE_TRUNC('month', NOW()) AS month,
  COUNT(*) FILTER (WHERE m.event = 'job_started') AS jobs_started,
  COUNT(*) FILTER (WHERE m.event = 'job_completed') AS jobs_completed,
  COUNT(*) FILTER (WHERE m.event = 'job_failed') AS jobs_failed,
  COUNT(*) FILTER (WHERE m.event = 'publish_attempt' AND m.success = true) AS publishes_success,
  COUNT(*) FILTER (WHERE m.event = 'publish_attempt' AND m.success = false) AS publishes_failed,
  ROUND(AVG(m.duration_ms) FILTER (WHERE m.event = 'job_completed'))::INTEGER AS avg_duration_ms
FROM bookagent_usage_metrics m
LEFT JOIN bookagent_plan_overrides po ON po.user_id = m.user_id
WHERE m.created_at >= DATE_TRUNC('month', NOW())
GROUP BY m.user_id, po.plan_tier;

CREATE OR REPLACE VIEW bookagent_revenue_estimate AS
SELECT
  mu.plan_tier,
  COUNT(DISTINCT mu.user_id) AS active_users,
  SUM(mu.jobs_started) AS total_jobs,
  SUM(CASE mu.plan_tier
    WHEN 'basic' THEN 9700 WHEN 'pro' THEN 24700 WHEN 'business' THEN 99700 ELSE 9700
  END) AS gross_revenue_brl_cents,
  SUM(CASE mu.plan_tier
    WHEN 'basic' THEN mu.jobs_started * 850 WHEN 'pro' THEN mu.jobs_started * 1200
    WHEN 'business' THEN mu.jobs_started * 1500 ELSE mu.jobs_started * 850
  END) AS estimated_cost_brl_cents
FROM bookagent_monthly_usage mu
GROUP BY mu.plan_tier;

-- ============================================================================
-- MIGRATION 005: Leads
-- ============================================================================

CREATE TABLE IF NOT EXISTS bookagent_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL UNIQUE,
  name            TEXT,
  source          TEXT NOT NULL DEFAULT 'whatsapp'
                    CHECK (source IN ('whatsapp', 'instagram', 'direct', 'referral')),
  stage           TEXT NOT NULL DEFAULT 'new'
                    CHECK (stage IN (
                      'new', 'demo_sent', 'demo_processing',
                      'demo_delivered', 'offer_sent', 'converted', 'lost', 'reactivated'
                    )),
  demos_used      INTEGER NOT NULL DEFAULT 0,
  demos_limit     INTEGER NOT NULL DEFAULT 3,
  plan_tier       TEXT CHECK (plan_tier IN ('basic', 'pro', 'business')),
  converted_at    TIMESTAMPTZ,
  first_contact_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  demo_sent_at      TIMESTAMPTZ,
  demo_delivered_at TIMESTAMPTZ,
  offer_sent_at     TIMESTAMPTZ,
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_job_id     UUID REFERENCES bookagent_jobs(id) ON DELETE SET NULL,
  notes           TEXT,
  utm_source      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_leads_stage_idx ON bookagent_leads (stage, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS bookagent_leads_phone_idx ON bookagent_leads (phone);
CREATE INDEX IF NOT EXISTS bookagent_leads_converted_idx ON bookagent_leads (converted_at) WHERE converted_at IS NOT NULL;

DROP TRIGGER IF EXISTS bookagent_leads_updated_at ON bookagent_leads;
CREATE TRIGGER bookagent_leads_updated_at
  BEFORE UPDATE ON bookagent_leads
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

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
  content     TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_lead_events_lead_id_idx
  ON bookagent_lead_events (lead_id, created_at DESC);

CREATE OR REPLACE VIEW bookagent_funnel_summary AS
SELECT
  stage,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE last_activity_at > NOW() - INTERVAL '7 days') AS active_last_7d,
  ROUND(100.0 * COUNT(*) FILTER (WHERE converted_at IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS conversion_rate_pct,
  ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(converted_at, last_activity_at) - first_contact_at)) / 3600), 1) AS avg_hours_in_stage
FROM bookagent_leads
GROUP BY stage
ORDER BY
  CASE stage
    WHEN 'new' THEN 1 WHEN 'demo_sent' THEN 2 WHEN 'demo_processing' THEN 3
    WHEN 'demo_delivered' THEN 4 WHEN 'offer_sent' THEN 5 WHEN 'converted' THEN 6
    WHEN 'reactivated' THEN 7 WHEN 'lost' THEN 8
  END;

-- ============================================================================
-- MIGRATION 006: Growth Monitoring
-- ============================================================================

CREATE OR REPLACE VIEW bookagent_jobs_hourly AS
SELECT
  DATE_TRUNC('hour', created_at) AS hora,
  COUNT(*) AS total_jobs,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(AVG(CASE WHEN status = 'completed'
    THEN EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000 END), 0) AS avg_duration_ms
FROM bookagent_jobs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 1 DESC;

CREATE OR REPLACE VIEW bookagent_cost_by_user AS
SELECT
  jm.user_id,
  COALESCE(jm.plan_type, 'basic') AS plan_tier,
  COUNT(j.id) AS jobs_this_month,
  COUNT(j.id) * CASE COALESCE(jm.plan_type, 'basic')
    WHEN 'basic' THEN 850 WHEN 'pro' THEN 1200 WHEN 'business' THEN 1500 ELSE 850
  END AS estimated_cost_centavos,
  CASE COALESCE(jm.plan_type, 'basic')
    WHEN 'basic' THEN 9700 WHEN 'pro' THEN 24700 WHEN 'business' THEN 99700 ELSE 9700
  END AS plan_revenue_centavos,
  CASE COALESCE(jm.plan_type, 'basic')
    WHEN 'basic' THEN 9700 WHEN 'pro' THEN 24700 WHEN 'business' THEN 99700 ELSE 9700
  END - COUNT(j.id) * CASE COALESCE(jm.plan_type, 'basic')
    WHEN 'basic' THEN 850 WHEN 'pro' THEN 1200 WHEN 'business' THEN 1500 ELSE 850
  END AS estimated_margin_centavos
FROM bookagent_jobs j
JOIN bookagent_job_meta jm ON j.id = jm.job_id
WHERE j.created_at >= DATE_TRUNC('month', NOW())
GROUP BY jm.user_id, jm.plan_type;

CREATE OR REPLACE VIEW bookagent_system_health AS
SELECT
  (SELECT COUNT(DISTINCT jm.user_id) FROM bookagent_job_meta jm JOIN bookagent_jobs j ON j.id = jm.job_id WHERE j.created_at >= NOW() - INTERVAL '30 days') AS active_users_30d,
  (SELECT COUNT(*) FROM bookagent_jobs WHERE created_at >= DATE_TRUNC('month', NOW())) AS jobs_this_month,
  (SELECT COUNT(*) FROM bookagent_jobs WHERE created_at >= NOW() - INTERVAL '24 hours') AS jobs_last_24h,
  (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000), 0) FROM bookagent_jobs WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '7 days') AS avg_duration_ms_7d,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0), 1) FROM bookagent_jobs WHERE created_at >= NOW() - INTERVAL '7 days') AS error_rate_pct_7d,
  (SELECT COUNT(*) FROM bookagent_leads WHERE created_at >= DATE_TRUNC('month', NOW())) AS new_leads_this_month,
  (SELECT COUNT(*) FROM bookagent_leads WHERE converted_at IS NOT NULL AND converted_at >= DATE_TRUNC('month', NOW())) AS conversions_this_month;

CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_event_created_idx ON bookagent_usage_metrics (event, created_at DESC);
CREATE INDEX IF NOT EXISTS bookagent_usage_metrics_user_month_idx ON bookagent_usage_metrics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookagent_jobs_status_created_idx ON bookagent_jobs (status, created_at DESC);

-- ============================================================================
-- MIGRATION 007: Video Render
-- ============================================================================

ALTER TABLE bookagent_job_meta
  ADD COLUMN IF NOT EXISTS video_render_status TEXT
    CHECK (video_render_status IN ('queued', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS video_render_artifact_id UUID,
  ADD COLUMN IF NOT EXISTS video_render_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS video_render_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS video_render_output_path TEXT,
  ADD COLUMN IF NOT EXISTS video_render_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS video_render_duration_seconds NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS video_render_scene_count INTEGER,
  ADD COLUMN IF NOT EXISTS video_render_error TEXT;

CREATE INDEX IF NOT EXISTS bookagent_job_meta_video_status_idx
  ON bookagent_job_meta (video_render_status)
  WHERE video_render_status IS NOT NULL;

-- ============================================================================
-- MIGRATION 008: Video Jobs (standalone table for video generation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.video_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid,  -- references auth.users if Supabase Auth is enabled
  property_id     uuid,
  status          text DEFAULT 'processing'
                  CHECK (status IN ('processing','done','error')),
  template        text,
  tier            text DEFAULT 'tier1',
  video_url       text,
  error_msg       text,
  duration_s      integer,
  render_time_s   integer,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_jobs' AND policyname='service_role_video_jobs') THEN
    CREATE POLICY "service_role_video_jobs" ON public.video_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- MIGRATION 009: Publications Social Publish (status expanded + content_type)
-- ============================================================================

ALTER TABLE bookagent_publications
  DROP CONSTRAINT IF EXISTS bookagent_publications_status_check;

ALTER TABLE bookagent_publications
  ADD CONSTRAINT bookagent_publications_status_check
    CHECK (status IN (
      'pending', 'queued', 'publishing', 'published',
      'failed', 'retrying', 'skipped', 'scheduled'
    ));

ALTER TABLE bookagent_publications
  ADD COLUMN IF NOT EXISTS content_type TEXT;

-- ============================================================================
-- MIGRATION 010: Tenants table for Supabase Auth integration
-- ============================================================================

CREATE TABLE IF NOT EXISTS bookagent_tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID UNIQUE,  -- FK to auth.users when Auth is enabled
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  plan_tier       TEXT NOT NULL DEFAULT 'basic'
                    CHECK (plan_tier IN ('basic', 'pro', 'business')),
  subscription_status TEXT NOT NULL DEFAULT 'trial'
                    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'paused')),
  trial_ends_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  avatar_url      TEXT,
  company         TEXT,
  phone           TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookagent_tenants_email_idx ON bookagent_tenants (email);
CREATE INDEX IF NOT EXISTS bookagent_tenants_auth_user_idx ON bookagent_tenants (auth_user_id) WHERE auth_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS bookagent_tenants_updated_at ON bookagent_tenants;
CREATE TRIGGER bookagent_tenants_updated_at
  BEFORE UPDATE ON bookagent_tenants
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_updated_at();

ALTER TABLE bookagent_tenants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookagent_tenants' AND policyname='service_role_all_tenants') THEN
    CREATE POLICY "service_role_all_tenants" ON bookagent_tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add tenant_id to jobs and job_meta for tenant scoping
ALTER TABLE bookagent_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES bookagent_tenants(id);
ALTER TABLE bookagent_job_meta ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES bookagent_tenants(id);
CREATE INDEX IF NOT EXISTS bookagent_jobs_tenant_id_idx ON bookagent_jobs (tenant_id) WHERE tenant_id IS NOT NULL;

COMMENT ON TABLE bookagent_tenants IS 'Tenant profiles linked to Supabase Auth users. Each tenant maps to a dashboard user.';

-- ============================================================================
-- DONE: All migrations applied
-- ============================================================================
SELECT 'All BookAgent migrations completed successfully!' AS result;
