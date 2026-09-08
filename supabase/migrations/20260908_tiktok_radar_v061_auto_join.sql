-- TikTok Radar V0.6.1 — worker-safe high-confidence auto-join
create or replace function public.radar_worker_auto_join_watchlist(p_token text, p_row jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.radar_worker_authorized(p_token) then raise exception 'unauthorized'; end if;
  insert into public.tiktok_watchlist(
    username,display_name,account_type,country_code,city,market_scope,priority,watch_tier,
    scan_interval_minutes,live_monitor,video_comment_monitor,is_active,notes
  ) values (
    lower(regexp_replace(coalesce(p_row->>'username',''),'^@','')),
    nullif(p_row->>'display_name',''),coalesce(nullif(p_row->>'account_type',''),'auto'),'CI','Abidjan','abidjan_auto',
    greatest(0,least(100,coalesce((p_row->>'priority')::int,80))),
    coalesce(nullif(p_row->>'watch_tier',''),'B'),
    coalesce((p_row->>'scan_interval_minutes')::int,30),true,true,true,
    coalesce(nullif(p_row->>'notes',''),'Auto-joined by TikTok Radar high-confidence rule')
  )
  on conflict (username) do update set
    priority=greatest(public.tiktok_watchlist.priority,excluded.priority),
    is_active=true,
    live_monitor=true,
    video_comment_monitor=true,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
