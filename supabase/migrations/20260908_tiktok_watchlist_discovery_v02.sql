alter table public.tiktok_watchlist add column if not exists watch_tier text not null default 'B' check (watch_tier in ('A','B','C'));
alter table public.tiktok_watchlist add column if not exists live_monitor boolean not null default true;
alter table public.tiktok_watchlist add column if not exists video_comment_monitor boolean not null default true;
alter table public.tiktok_watchlist add column if not exists scan_interval_minutes integer not null default 30 check (scan_interval_minutes between 5 and 1440);
alter table public.tiktok_watchlist add column if not exists last_scan_at timestamptz;
alter table public.tiktok_watchlist add column if not exists last_live_seen_at timestamptz;
alter table public.tiktok_watchlist add column if not exists last_content_seen_at timestamptz;

update public.tiktok_watchlist
set scan_interval_minutes = case watch_tier when 'A' then 10 when 'B' then 30 else 120 end
where scan_interval_minutes is null or scan_interval_minutes = 30;

create table if not exists public.tiktok_watchlist_suggestions (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  display_name text,
  country_code text not null default 'CI',
  city text default 'Abidjan',
  account_type text,
  source_type text,
  source_url text,
  geo_score integer not null default 0 check (geo_score between 0 and 100),
  auto_relevance_score integer not null default 0 check (auto_relevance_score between 0 and 100),
  purchase_signal_count integer not null default 0,
  live_signal_count integer not null default 0,
  video_signal_count integer not null default 0,
  suggested_priority integer not null default 50 check (suggested_priority between 0 and 100),
  suggested_tier text not null default 'C' check (suggested_tier in ('A','B','C')),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'suggested' check (status in ('suggested','approved','rejected')),
  approved_watchlist_id uuid references public.tiktok_watchlist(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(username)
);

create index if not exists tiktok_watchlist_suggestions_status_idx on public.tiktok_watchlist_suggestions(status, suggested_priority desc);
create index if not exists tiktok_watchlist_suggestions_geo_idx on public.tiktok_watchlist_suggestions(country_code, city, geo_score desc);

alter table public.tiktok_watchlist_suggestions enable row level security;
grant select, insert, update on public.tiktok_watchlist_suggestions to authenticated;

drop policy if exists watchlist_suggestions_read on public.tiktok_watchlist_suggestions;
create policy watchlist_suggestions_read on public.tiktok_watchlist_suggestions
for select to authenticated
using (public.current_role() = any(array['owner'::app_role,'manager'::app_role]));

drop policy if exists watchlist_suggestions_manage on public.tiktok_watchlist_suggestions;
create policy watchlist_suggestions_manage on public.tiktok_watchlist_suggestions
for all to authenticated
using (public.current_role() = any(array['owner'::app_role,'manager'::app_role]))
with check (public.current_role() = any(array['owner'::app_role,'manager'::app_role]));

create or replace function public.gfauto_prepare_watchlist_suggestion()
returns trigger language plpgsql set search_path='public' as $$
begin
  new.updated_at := now();
  if new.status in ('approved','rejected') and new.reviewed_at is null then
    new.reviewed_at := now();
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_prepare_watchlist_suggestion on public.tiktok_watchlist_suggestions;
create trigger trg_prepare_watchlist_suggestion before insert or update on public.tiktok_watchlist_suggestions
for each row execute function public.gfauto_prepare_watchlist_suggestion();

comment on table public.tiktok_watchlist_suggestions is 'AI/system-discovered Côte d’Ivoire automotive TikTok accounts awaiting manager approval before monitoring.';