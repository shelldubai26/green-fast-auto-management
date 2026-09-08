create or replace function public.radar_worker_purge_invalid(p_token text)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;begin
 if not public.radar_worker_authorized(p_token) then raise exception 'unauthorized'; end if;
 delete from social_leads where lead_quality='invalid' and purge_after is not null and purge_after<=now();
 get diagnostics n=row_count; return n;
end $$;
revoke all on function public.radar_worker_purge_invalid(text) from public,authenticated;
grant execute on function public.radar_worker_purge_invalid(text) to anon;
