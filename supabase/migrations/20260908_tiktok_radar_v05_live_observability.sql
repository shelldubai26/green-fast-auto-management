-- TikTok Radar V0.5: live observability, signal history, and identity-level lead merge.
-- Applied to production Supabase on 2026-09-08.

alter table public.tiktok_radar_scan_runs
  add column if not exists outcome text,
  add column if not exists live_status boolean,
  add column if not exists duration_ms integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.tiktok_watcher_state
  add column if not exists last_candidates_found integer not null default 0,
  add column if not exists last_inserted_count integer not null default 0,
  add column if not exists consecutive_errors integer not null default 0,
  add column if not exists last_outcome text;

create table if not exists public.social_lead_signals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.social_leads(id) on delete cascade,
  platform text not null default 'tiktok',
  source_event_id text not null,
  source_type text not null,
  source_account text,
  source_url text,
  source_content_id text,
  original_text text not null,
  intent_label text,
  intent_score integer not null default 0,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(platform, source_event_id)
);

create index if not exists social_lead_signals_lead_idx on public.social_lead_signals(lead_id, occurred_at desc);
create index if not exists social_lead_signals_score_idx on public.social_lead_signals(intent_score desc, occurred_at desc);
alter table public.social_lead_signals enable row level security;

drop policy if exists social_lead_signals_read on public.social_lead_signals;
create policy social_lead_signals_read on public.social_lead_signals
for select to authenticated
using (
  exists (
    select 1 from public.social_leads l
    where l.id = social_lead_signals.lead_id
      and (
        l.assigned_to = auth.uid()
        or l.assigned_to is null
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','manager'))
      )
  )
);

grant select on public.social_lead_signals to authenticated;

-- The production migration also replaces radar_worker_save_state,
-- radar_worker_finish_scan_run, and radar_worker_insert_lead so the worker:
-- 1) records scan outcomes and health counters;
-- 2) writes market_country_code / market_city correctly;
-- 3) stores every candidate signal in social_lead_signals;
-- 4) merges repeated TikTok activity into one master social_leads row.
