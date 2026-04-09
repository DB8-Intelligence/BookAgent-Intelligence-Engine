-- Video generation jobs table
CREATE TABLE IF NOT EXISTS public.video_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id),
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

CREATE POLICY "users_own_video_jobs" ON public.video_jobs
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "service_role_video_jobs" ON public.video_jobs
  FOR ALL USING (auth.role() = 'service_role');
