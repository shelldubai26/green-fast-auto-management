create table if not exists public.tiktok_watcher_state (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.tiktok_watchlist(id) on delete cascade,
  channel text not null check (channel in ('live','video_comment')),
  provider text,
  live_status boolean,
  cursor_value text,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_items_seen integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(watchlist_id, channel)
);

alter table public.tiktok_watcher_state enable row level security;

drop policy if exists tiktok_watcher_state_read on public.tiktok_watcher_state;
create policy tiktok_watcher_state_read on public.tiktok_watcher_state
for select to authenticated
using (public.current_role() = any(array['owner'::app_role,'manager'::app_role]));

create index if not exists tiktok_watcher_state_checked_idx on public.tiktok_watcher_state(last_checked_at desc);
create index if not exists tiktok_watcher_state_status_idx on public.tiktok_watcher_state(channel, live_status);

grant select on public.tiktok_watcher_state to authenticated;

create or replace function public.gfauto_touch_watcher_state()
returns trigger language plpgsql set search_path='public' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_watcher_state on public.tiktok_watcher_state;
create trigger trg_touch_watcher_state before update on public.tiktok_watcher_state
for each row execute function public.gfauto_touch_watcher_state();
