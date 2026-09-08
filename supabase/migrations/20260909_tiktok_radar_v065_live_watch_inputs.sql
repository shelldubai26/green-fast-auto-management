-- TikTok Radar V0.6.5 — token-guarded LIVE Watch input feed

create or replace function public.radar_worker_get_live_watch_inputs(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.radar_worker_authorized(p_token) then
    raise exception 'unauthorized';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'watchlist_id', w.id,
      'username', w.username,
      'display_name', w.display_name,
      'watch_tier', w.watch_tier,
      'priority', w.priority,
      'live_monitor', w.live_monitor,
      'last_checked_at', s.last_checked_at,
      'last_success_at', s.last_success_at,
      'live_status', s.live_status,
      'last_items_seen', coalesce(s.last_items_seen,0),
      'last_candidates_found', coalesce(s.last_candidates_found,0),
      'last_inserted_count', coalesce(s.last_inserted_count,0),
      'last_outcome', s.last_outcome,
      'last_error', s.last_error
    ) order by w.priority desc, w.username)
    from public.tiktok_watchlist w
    left join public.tiktok_watcher_state s
      on s.watchlist_id = w.id and s.channel = 'live'
    where w.is_active = true and w.live_monitor = true
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.radar_worker_get_live_watch_inputs(text) to anon, authenticated;
