-- Fix V0.6.1 config RPC to reuse the existing worker-token authorization function.
create or replace function public.radar_worker_get_config(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_watchlist jsonb;
  v_rules jsonb;
  v_controls jsonb;
begin
  if not public.radar_worker_authorized(p_token) then raise exception 'unauthorized'; end if;

  select coalesce(jsonb_agg(to_jsonb(w) order by w.priority desc, w.username), '[]'::jsonb)
    into v_watchlist
  from public.tiktok_watchlist w
  where w.is_active = true and w.country_code = 'CI' and w.city = 'Abidjan';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,'intent_category',r.intent_type,'intent_type',r.intent_type,'pattern',r.pattern,
      'match_type',r.match_type,'weight',r.weight,'language',r.language,'market_scope',r.market_scope,'is_active',r.is_active
    ) order by r.weight desc, r.pattern), '[]'::jsonb)
    into v_rules
  from public.tiktok_intent_rules r
  where r.is_active = true and r.market_scope = 'abidjan_auto';

  select jsonb_build_object(
    'master_enabled', coalesce(c.master_enabled,true),
    'auto_discovery_enabled', coalesce(c.auto_discovery_enabled,false),
    'auto_join_enabled', coalesce(c.auto_join_enabled,false),
    'auto_join_min_score', coalesce(c.auto_join_min_score,80),
    'public_contact_enrichment_enabled', coalesce(c.public_contact_enrichment_enabled,true)
  ) into v_controls
  from public.radar_worker_config c
  limit 1;

  return jsonb_build_object('watchlist',v_watchlist,'rules',v_rules,'controls',coalesce(v_controls,'{}'::jsonb),'server_time',now());
end;
$$;
