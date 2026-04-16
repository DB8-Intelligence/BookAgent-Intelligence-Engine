-- ============================================================================
-- BookAgent Intelligence Engine — Migration 008
-- webhook_events, user_plans, upsert_lead function, pipeline_status view
-- Aplicada em: 2026-04-09
-- ============================================================================

CREATE TABLE IF NOT EXISTS bookagent_webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT NOT NULL,
  source        TEXT NOT NULL,
  job_id        UUID,
  payload       JSONB NOT NULL DEFAULT '{}',
  processed     BOOLEAN NOT NULL DEFAULT FALSE,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bookagent_webhook_events_job_id_idx   ON bookagent_webhook_events (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookagent_webhook_events_type_idx     ON bookagent_webhook_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS bookagent_webhook_events_pending_idx  ON bookagent_webhook_events (processed, created_at DESC) WHERE processed = FALSE;

CREATE TABLE IF NOT EXISTS bookagent_user_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT,
  phone           TEXT,
  plan            TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','starter','basico','pro','max')),
  hotmart_sub_id  TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','trial')),
  books_used      INTEGER NOT NULL DEFAULT 0,
  books_limit     INTEGER NOT NULL DEFAULT 1,
  valid_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bookagent_user_plans_user_or_phone CHECK (user_id IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS bookagent_user_plans_user_id_key   ON bookagent_user_plans (user_id)         WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookagent_user_plans_phone_key     ON bookagent_user_plans (phone)           WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bookagent_user_plans_hotmart_key   ON bookagent_user_plans (hotmart_sub_id)  WHERE hotmart_sub_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookagent_user_plans_status_idx           ON bookagent_user_plans (status, valid_until);

CREATE OR REPLACE FUNCTION bookagent_update_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS bookagent_user_plans_updated_at ON bookagent_user_plans;
CREATE TRIGGER bookagent_user_plans_updated_at
  BEFORE UPDATE ON bookagent_user_plans
  FOR EACH ROW EXECUTE FUNCTION bookagent_update_timestamp();

ALTER TABLE bookagent_leads DROP CONSTRAINT IF EXISTS bookagent_leads_source_check;
ALTER TABLE bookagent_leads ADD CONSTRAINT bookagent_leads_source_check
  CHECK (source IN ('whatsapp','instagram','direct','referral','dashboard','api'));

CREATE OR REPLACE FUNCTION bookagent_upsert_lead(
  p_phone TEXT, p_name TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'whatsapp', p_utm_source TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE v_lead_id UUID; v_is_new BOOLEAN := FALSE; v_source TEXT;
BEGIN
  v_source := CASE WHEN p_source IN ('whatsapp','instagram','direct','referral','dashboard','api') THEN p_source ELSE 'whatsapp' END;
  INSERT INTO bookagent_leads (phone, name, source, utm_source, stage, first_contact_at, last_activity_at)
  VALUES (p_phone, p_name, v_source, p_utm_source, 'new', NOW(), NOW())
  ON CONFLICT (phone) DO UPDATE SET
    name=COALESCE(EXCLUDED.name, bookagent_leads.name), last_activity_at=NOW(), updated_at=NOW()
  RETURNING id, (xmax=0) INTO v_lead_id, v_is_new;
  INSERT INTO bookagent_user_plans (phone, plan, status, books_limit) VALUES (p_phone,'free','trial',1) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('lead_id', v_lead_id, 'is_new', v_is_new, 'phone', p_phone);
END; $$;

CREATE OR REPLACE VIEW bookagent_pipeline_status AS
SELECT j.id AS job_id, j.status, j.input_type, j.created_at, j.completed_at, j.artifacts_count,
  j.sources_count, j.error, m.user_id, m.plan_type, m.source_channel, m.auto_publish,
  m.webhook_phone, m.approval_status, m.approval_round, m.video_render_status,
  (SELECT a.decision FROM bookagent_approvals a WHERE a.job_id=j.id ORDER BY a.created_at DESC LIMIT 1) AS last_approval_decision,
  (SELECT ba.content_url FROM bookagent_job_artifacts ba WHERE ba.job_id=j.id AND ba.artifact_type='video_render' ORDER BY ba.created_at DESC LIMIT 1) AS video_url,
  (SELECT ba.content_url FROM bookagent_job_artifacts ba WHERE ba.job_id=j.id AND ba.artifact_type='thumbnail' ORDER BY ba.created_at DESC LIMIT 1) AS thumbnail_url
FROM bookagent_jobs j LEFT JOIN bookagent_job_meta m ON m.job_id=j.id;
