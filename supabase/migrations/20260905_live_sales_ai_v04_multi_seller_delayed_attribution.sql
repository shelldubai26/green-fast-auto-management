-- LIVE SALES AI V0.4 — multi-seller TikTok accounts + delayed conversion attribution
create table if not exists public.tiktok_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  open_id text not null,
  union_id text,
  display_name text,
  username text,
  avatar_url text,
  scopes text[] not null default '{}',
  token_ref text,
  token_status text not null default 'connected' check (token_status in ('connected','expired','revoked','error')),
  connected_at timestamptz not null default now(),
  last_refresh_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(profile_id, open_id)
);

alter table public.tiktok_accounts enable row level security;
drop policy if exists tiktok_accounts_self_read on public.tiktok_accounts;
create policy tiktok_accounts_self_read on public.tiktok_accounts for select using (
  profile_id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('owner','manager'))
);
drop policy if exists tiktok_accounts_self_write on public.tiktok_accounts;
create policy tiktok_accounts_self_write on public.tiktok_accounts for all using (
  profile_id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('owner','manager'))
) with check (
  profile_id = auth.uid() or exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('owner','manager'))
);

alter table public.live_sessions
  add column if not exists tiktok_account_id uuid references public.tiktok_accounts(id) on delete set null,
  add column if not exists attribution_window_days integer not null default 90 check (attribution_window_days between 1 and 365);

alter table public.live_leads
  add column if not exists attribution_role text check (attribution_role in ('primary','assist')),
  add column if not exists attributed_revenue_xof numeric not null default 0,
  add column if not exists conversion_delay_days numeric;

create table if not exists public.live_touchpoints (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  director_action_id bigint references public.live_director_actions(id) on delete set null,
  touch_type text not null default 'live_view' check (touch_type in ('live_view','comment','lead','whatsapp','appointment','visit','test_drive','deposit','sale')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists live_touchpoints_customer_time_idx on public.live_touchpoints(customer_id, occurred_at desc);
create index if not exists live_sessions_presenter_idx on public.live_sessions(presenter_id, started_at desc);
create index if not exists live_sessions_tiktok_account_idx on public.live_sessions(tiktok_account_id, started_at desc);

alter table public.live_touchpoints enable row level security;
drop policy if exists live_touchpoints_staff_read on public.live_touchpoints;
create policy live_touchpoints_staff_read on public.live_touchpoints for select using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.active=true));
drop policy if exists live_touchpoints_staff_write on public.live_touchpoints;
create policy live_touchpoints_staff_write on public.live_touchpoints for all using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.active=true)) with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.active=true));

-- Primary attribution = most recent eligible LIVE touch before the sale, default window 90 days.
-- Other eligible LIVE touches remain assists. This prevents duplicate revenue across many seller sessions.
create or replace function public.gf_sync_live_lead_from_sale()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_primary_id uuid; v_primary_session uuid; v_session uuid; v_sold_at timestamptz;
begin
  v_sold_at := coalesce(new.sold_at, now());
  select ll.id, ll.session_id into v_primary_id, v_primary_session
  from public.live_leads ll join public.live_sessions ls on ls.id=ll.session_id
  where ll.customer_id=new.customer_id
    and coalesce(ls.started_at,ll.created_at) <= v_sold_at
    and v_sold_at <= coalesce(ls.started_at,ll.created_at) + make_interval(days=>ls.attribution_window_days)
  order by coalesce(ls.started_at,ll.created_at) desc limit 1;

  update public.live_leads set
    sale_id=new.id, sale_price_xof=new.sale_price_xof,
    won_at=coalesce(won_at,v_sold_at), status='won',
    attribution_role=case when id=v_primary_id then 'primary' else 'assist' end,
    attributed_revenue_xof=case when id=v_primary_id then new.sale_price_xof else 0 end,
    conversion_delay_days=case when id=v_primary_id then extract(epoch from (v_sold_at-created_at))/86400.0 else conversion_delay_days end,
    updated_at=now()
  where customer_id=new.customer_id;

  insert into public.live_touchpoints(customer_id,session_id,touch_type,occurred_at)
  select new.customer_id,v_primary_session,'sale',v_sold_at where v_primary_session is not null;

  for v_session in select distinct session_id from public.live_leads where customer_id=new.customer_id and session_id is not null loop
    perform public.gf_refresh_live_session_outcomes(v_session);
  end loop;
  return new;
end;$$;

drop trigger if exists trg_gf_sync_live_lead_from_sale on public.sales;
create trigger trg_gf_sync_live_lead_from_sale after insert or update of sale_price_xof,sold_at on public.sales for each row execute function public.gf_sync_live_lead_from_sale();