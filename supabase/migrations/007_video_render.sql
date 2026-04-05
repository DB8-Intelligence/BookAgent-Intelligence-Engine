-- ============================================================================
-- BookAgent Intelligence Engine — Video Render Async
-- Migration: 007_video_render.sql
-- Data: 2026-04-05 | Parte 59.2
-- ============================================================================
--
-- Adds video render tracking columns to bookagent_job_meta.
-- Supports the async video render pipeline:
--   POST /render-video → queue → worker → .mp4 artifact
-- ============================================================================

-- Video render status columns on job_meta
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

-- Index for finding jobs with pending video renders
CREATE INDEX IF NOT EXISTS bookagent_job_meta_video_status_idx
  ON bookagent_job_meta (video_render_status)
  WHERE video_render_status IS NOT NULL;

COMMENT ON COLUMN bookagent_job_meta.video_render_status IS
  'Status do render de vídeo: queued → processing → completed/failed';
COMMENT ON COLUMN bookagent_job_meta.video_render_artifact_id IS
  'ID do artifact RENDER_SPEC usado como input para o render';
