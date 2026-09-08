-- TikTok Radar V0.6.1 — privacy, owner controls, public-contact enrichment

alter table if exists public.social_leads
  add column if not exists public_phone text,
  add column if not exists public_whatsapp text,
  add column if not exists public_email text,
  add column if not exists public_contact_source text,
  add column if not exists public_contact_confidence integer not null default 0,
  add column if not exists public_contact_checked_at timestamptz;

alter table if exists public.radar_worker_config
  add column if not exists master_enabled boolean not null default true,
  add column if not exists auto_discovery_enabled boolean not null default false,
  add column if not exists auto_join_enabled boolean not null default false,
  add column if not exists auto_join_min_score integer not null default 80,
  add column if not exists public_contact_enrichment_enabled boolean not null default true;

create or replace function public.gfauto_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'owner');
$$;
grant execute on function public.gfauto_is_owner() to authenticated;

-- Sales only see leads assigned to them. Managers/owners retain pool visibility and assignment rights.
drop policy if exists social_leads_read on public.social_leads;
drop policy if exists social_leads_update on public.social_leads;
create policy social_leads_read on public.social_leads
for select to authenticated
using ((public.current_role() = any(array['owner'::app_role,'manager'::app_role])) or assigned_to = auth.uid());
create policy social_leads_update on public.social_leads
for update to authenticated
using ((public.current_role() = any(array['owner'::app_role,'manager'::app_role])) or assigned_to = auth.uid())
with check ((public.current_role() = any(array['owner'::app_role,'manager'::app_role])) or assigned_to = auth.uid());

-- Watchlist/monitoring internals are owner-only in authenticated UI. Worker RPCs remain security-definer/token guarded.
drop policy if exists tiktok_watchlist_read on public.tiktok_watchlist;
drop policy if exists tiktok_watchlist_write on public.tiktok_watchlist;
drop policy if exists tiktok_watchlist_select on public.tiktok_watchlist;
drop policy if exists tiktok_watchlist_modify on public.tiktok_watchlist;
create policy tiktok_watchlist_owner_select on public.tiktok_watchlist for select to authenticated using (public.gfauto_is_owner());
create policy tiktok_watchlist_owner_insert on public.tiktok_watchlist for insert to authenticated with check (public.gfauto_is_owner());
create policy tiktok_watchlist_owner_update on public.tiktok_watchlist for update to authenticated using (public.gfauto_is_owner()) with check (public.gfauto_is_owner());
create policy tiktok_watchlist_owner_delete on public.tiktok_watchlist for delete to authenticated using (public.gfauto_is_owner());

drop policy if exists radar_worker_config_owner_select on public.radar_worker_config;
drop policy if exists radar_worker_config_owner_update on public.radar_worker_config;
alter table public.radar_worker_config enable row level security;
create policy radar_worker_config_owner_select on public.radar_worker_config for select to authenticated using (public.gfauto_is_owner());
create policy radar_worker_config_owner_update on public.radar_worker_config for update to authenticated using (public.gfauto_is_owner()) with check (public.gfauto_is_owner());
grant select, update on public.radar_worker_config to authenticated;

create or replace function public.radar_worker_get_config(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_watchlist jsonb;
  v_rules jsonb;
  v_controls jsonb;
begin
  select exists(
    select 1 from public.radar_worker_tokens t
    where t.token_hash = encode(digest(p_token, 'sha256'), 'hex')
      and t.is_active = true
      and (t.expires_at is null or t.expires_at > now())
  ) into v_ok;
  if not v_ok then raise exception 'unauthorized'; end if;

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
