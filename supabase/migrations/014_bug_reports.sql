-- Bug Reports table for in-app bug reporting
-- Follows BookAgent naming convention (bookagent_ prefix)

create table if not exists public.bookagent_bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  severity text not null default 'bug'
    check (severity in ('blocker', 'bug', 'suggestion')),
  status text not null default 'new'
    check (status in ('new', 'investigating', 'fixed', 'wont_fix')),
  context jsonb not null default '{}'::jsonb,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bug_reports_status_date
  on public.bookagent_bug_reports(status, created_at desc);
create index if not exists idx_bug_reports_severity_status
  on public.bookagent_bug_reports(severity, status);
create index if not exists idx_bug_reports_user_date
  on public.bookagent_bug_reports(user_id, created_at desc);

-- Updated_at trigger (reuse project function if exists, create if not)
create or replace function public.bookagent_update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger bookagent_bug_reports_updated_at
  before update on public.bookagent_bug_reports
  for each row execute function public.bookagent_update_updated_at();

-- RLS
alter table public.bookagent_bug_reports enable row level security;

create policy "bugs_own_read" on public.bookagent_bug_reports
  for select using (auth.uid() = user_id);

create policy "bugs_own_insert" on public.bookagent_bug_reports
  for insert with check (auth.uid() = user_id);
