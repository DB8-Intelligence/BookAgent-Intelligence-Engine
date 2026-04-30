-- Billing & Usage tracking tables
-- Required by: usage-meter.ts, limit-checker.ts, subscription-manager.ts

-- 1. Usage records (audit trail, insert-only)
create table if not exists public.bookagent_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  event_type text not null,
  quantity integer not null default 1,
  job_id uuid,
  artifact_id uuid,
  estimated_cost_usd numeric(10,4),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_tenant_event
  on public.bookagent_usage(tenant_id, event_type, created_at desc);
create index if not exists idx_usage_job
  on public.bookagent_usage(job_id) where job_id is not null;

-- 2. Usage counters (aggregated, upsert)
create table if not exists public.bookagent_usage_counters (
  tenant_id uuid not null,
  event_type text not null,
  period_key text not null,
  period text not null default 'monthly',
  count integer not null default 0,
  total_value numeric(16,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, event_type, period_key)
);

create index if not exists idx_counters_tenant_period
  on public.bookagent_usage_counters(tenant_id, period_key);

-- 3. Billing events (plan changes, limit alerts)
create table if not exists public.bookagent_billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  previous_plan text,
  current_plan text not null,
  details text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_events_tenant
  on public.bookagent_billing_events(tenant_id, created_at desc);

-- 4. Subscriptions
create table if not exists public.bookagent_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique,
  plan_tier text not null default 'starter'
    check (plan_tier in ('starter', 'pro', 'agency')),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'canceled')),
  provider text not null default 'none'
    check (provider in ('stripe', 'asaas', 'hotmart', 'kiwify', 'manual', 'none')),
  provider_subscription_id text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bookagent_subscriptions_updated_at
  before update on public.bookagent_subscriptions
  for each row execute function public.bookagent_update_updated_at();

-- RLS: usage tables use service_role only (backend writes)
alter table public.bookagent_usage enable row level security;
alter table public.bookagent_usage_counters enable row level security;
alter table public.bookagent_billing_events enable row level security;
alter table public.bookagent_subscriptions enable row level security;
