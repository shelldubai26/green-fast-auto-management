-- TikTok Radar V0.6.5 — owner-only LIVE Watch state machine

create table if not exists public.tiktok_live_watch_status (
  watchlist_id uuid primary key references public.tiktok_watchlist(id) on delete cascade,
  status text not null default 'offline' check (status in ('offline','live_detected','listening','lead_detected','live_ended','error')),
  live_started_at timestamptz,
  live_ended_at timestamptz,
  last_event_at timestamptz,
  last_comment_at timestamptz,
  comments_seen integer not null default 0,
  candidates_found integer not null default 0,
  high_intent_found integer not null default 0,
  leads_inserted integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.tiktok_live_watch_status enable row level security;
drop policy if exists tiktok_live_watch_status_owner_select on public.tiktok_live_watch_status;
create policy tiktok_live_watch_status_owner_select
on public.tiktok_live_watch_status
for select to authenticated
using (public.gfauto_is_owner());
grant select on public.tiktok_live_watch_status to authenticated;

create or replace function public.radar_worker_live_watch_tick(
  p_token text,
  p_watchlist_id uuid,
  p_live boolean,
  p_listening boolean,
  p_items_delta integer default 0,
  p_candidates_delta integer default 0,
  p_high_intent_delta integer default 0,
  p_leads_delta integer default 0,
  p_last_comment_at timestamptz default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.tiktok_live_watch_status%rowtype;
  v_now timestamptz := now();
  v_status text;
begin
  if not public.radar_worker_authorized(p_token) then
    raise exception 'unauthorized';
  end if;

  select * into v_prev
  from public.tiktok_live_watch_status
  where watchlist_id = p_watchlist_id
  for update;

  if p_error is not null then
    v_status := 'error';
  elsif p_live then
    if coalesce(p_leads_delta,0) > 0 or coalesce(p_high_intent_delta,0) > 0 then
      v_status := 'lead_detected';
    elsif p_listening then
      v_status := 'listening';
    else
      v_status := 'live_detected';
    end if;
  elsif v_prev.live_started_at is not null and v_prev.live_ended_at is null then
    v_status := 'live_ended';
  else
    v_status := 'offline';
  end if;

  insert into public.tiktok_live_watch_status(
    watchlist_id,status,live_started_at,live_ended_at,last_event_at,last_comment_at,
    comments_seen,candidates_found,high_intent_found,leads_inserted,last_error,updated_at
  ) values (
    p_watchlist_id,
    v_status,
    case when p_live then v_now else null end,
    null,
    v_now,
    p_last_comment_at,
    greatest(coalesce(p_items_delta,0),0),
    greatest(coalesce(p_candidates_delta,0),0),
    greatest(coalesce(p_high_intent_delta,0),0),
    greatest(coalesce(p_leads_delta,0),0),
    p_error,
    v_now
  )
  on conflict (watchlist_id) do update set
    status = v_status,
    live_started_at = case
      when p_live and (tiktok_live_watch_status.live_started_at is null or tiktok_live_watch_status.live_ended_at is not null)
        then v_now
      else tiktok_live_watch_status.live_started_at
    end,
    live_ended_at = case
      when not p_live and tiktok_live_watch_status.live_started_at is not null and tiktok_live_watch_status.live_ended_at is null
        then v_now
      when p_live then null
      else tiktok_live_watch_status.live_ended_at
    end,
    last_event_at = v_now,
    last_comment_at = coalesce(p_last_comment_at,tiktok_live_watch_status.last_comment_at),
    comments_seen = case
      when p_live and tiktok_live_watch_status.live_ended_at is not null then greatest(coalesce(p_items_delta,0),0)
      else tiktok_live_watch_status.comments_seen + greatest(coalesce(p_items_delta,0),0)
    end,
    candidates_found = case
      when p_live and tiktok_live_watch_status.live_ended_at is not null then greatest(coalesce(p_candidates_delta,0),0)
      else tiktok_live_watch_status.candidates_found + greatest(coalesce(p_candidates_delta,0),0)
    end,
    high_intent_found = case
      when p_live and tiktok_live_watch_status.live_ended_at is not null then greatest(coalesce(p_high_intent_delta,0),0)
      else tiktok_live_watch_status.high_intent_found + greatest(coalesce(p_high_intent_delta,0),0)
    end,
    leads_inserted = case
      when p_live and tiktok_live_watch_status.live_ended_at is not null then greatest(coalesce(p_leads_delta,0),0)
      else tiktok_live_watch_status.leads_inserted + greatest(coalesce(p_leads_delta,0),0)
    end,
    last_error = p_error,
    updated_at = v_now;
end;
$$;

grant execute on function public.radar_worker_live_watch_tick(text,uuid,boolean,boolean,integer,integer,integer,integer,timestamptz,text) to anon, authenticated;
