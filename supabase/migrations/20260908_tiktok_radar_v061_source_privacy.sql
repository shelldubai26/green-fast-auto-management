-- TikTok Radar V0.6.1 — hide source-room/video internals from staff and managers.
-- Authenticated users can select only sales-facing lead columns; Owner gets source detail via guarded RPC.

revoke select on public.social_leads from authenticated;
grant select (
  id, platform, username, display_name, avatar_url, source_type, original_text, detected_language,
  interested_model, intent_label, intent_score, occurrence_count, first_seen_at, last_seen_at,
  status, assigned_to, assigned_at, contact_attempted_at, replied_at, contact_captured_at,
  converted_at, converted_customer_id, notes, market_country_code, market_city, geo_confidence,
  public_phone, public_whatsapp, public_email, public_contact_source, public_contact_confidence,
  public_contact_checked_at, created_at, updated_at
) on public.social_leads to authenticated;

create or replace function public.gfauto_owner_get_social_lead_source(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v jsonb;
begin
  if not public.gfauto_is_owner() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'source_account',l.source_account,
    'source_url',l.source_url,
    'source_content_id',l.source_content_id,
    'source_event_id',l.source_event_id
  ) into v
  from public.social_leads l where l.id=p_lead_id;
  return coalesce(v,'{}'::jsonb);
end;
$$;
grant execute on function public.gfauto_owner_get_social_lead_source(uuid) to authenticated;

-- Raw monitoring/support tables are Owner-only in the authenticated product UI.
do $$
declare t text; p record;
begin
  foreach t in array array['tiktok_watchlist_suggestions','tiktok_watcher_state','tiktok_radar_scan_runs','tiktok_radar_provider_health','social_lead_signals'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I',p.policyname,t);
      end loop;
      execute format('create policy %I on public.%I for select to authenticated using (public.gfauto_is_owner())',t||'_owner_select',t);
    end if;
  end loop;
end $$;
