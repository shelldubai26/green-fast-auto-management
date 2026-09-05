create table if not exists public.tiktok_account_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  open_id text unique,
  display_name text,
  avatar_url text,
  status text not null default 'pending' check (status in ('pending','connected','expired','revoked','error')),
  granted_scopes text[] not null default '{}',
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_sessions add column if not exists tiktok_account_id uuid references public.tiktok_account_connections(id) on delete set null;
alter table public.live_leads add column if not exists attribution_window_days integer not null default 120;
alter table public.live_leads add column if not exists source_locked_at timestamptz;
update public.live_leads set source_locked_at = coalesce(source_locked_at, created_at) where source_locked_at is null;

alter table public.tiktok_account_connections enable row level security;
drop policy if exists tiktok_account_connections_access on public.tiktok_account_connections;
create policy tiktok_account_connections_access on public.tiktok_account_connections
for all to authenticated
using (user_id = auth.uid() or public."current_role"() = any(array['owner'::app_role,'manager'::app_role]))
with check (user_id = auth.uid() or public."current_role"() = any(array['owner'::app_role,'manager'::app_role]));

create index if not exists idx_live_sessions_presenter_started on public.live_sessions(presenter_id, started_at desc);
create index if not exists idx_live_leads_customer_created on public.live_leads(customer_id, created_at desc);
create index if not exists idx_live_leads_session_created on public.live_leads(session_id, created_at desc);

create or replace view public.live_conversion_lag as
select ll.id as live_lead_id,ll.session_id,s.presenter_id,ll.customer_id,ll.created_at as lead_created_at,ll.won_at,
case when ll.won_at is not null then round((extract(epoch from (ll.won_at-ll.created_at))/86400.0)::numeric,2) end as days_to_sale,
ll.sale_price_xof,ll.attribution_window_days,
case when ll.won_at is null then 'open' when ll.won_at <= ll.created_at + make_interval(days => ll.attribution_window_days) then 'within_window' else 'late_conversion' end as conversion_window_status
from public.live_leads ll left join public.live_sessions s on s.id=ll.session_id;

create or replace view public.live_presenter_performance as
select s.presenter_id,count(distinct s.id) as live_sessions,count(ll.id) as live_leads,count(ll.won_at) as sales,
coalesce(sum(ll.sale_price_xof),0) as revenue_xof,
round(avg(case when ll.won_at is not null then extract(epoch from (ll.won_at-ll.created_at))/86400.0 end)::numeric,2) as avg_days_to_sale
from public.live_sessions s left join public.live_leads ll on ll.session_id=s.id group by s.presenter_id;
