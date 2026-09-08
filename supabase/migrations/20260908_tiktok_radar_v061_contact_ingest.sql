-- TikTok Radar V0.6.1 — persist public contact enrichment in worker ingest
create or replace function public.radar_worker_insert_lead(p_token text, p_row jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_lead_id uuid;
  v_incoming_score int := coalesce((p_row->>'intent_score')::int,0);
  v_incoming_status text := coalesce(p_row->>'status','new');
  v_existing_score int;
  v_existing_status text;
  v_new_master boolean := false;
begin
  if not public.radar_worker_authorized(p_token) then raise exception 'unauthorized'; end if;

  if exists (
    select 1 from public.social_lead_signals s
    where s.platform=coalesce(p_row->>'platform','tiktok')
      and s.source_event_id=p_row->>'source_event_id'
  ) then return false; end if;

  select l.id,l.intent_score,l.status into v_lead_id,v_existing_score,v_existing_status
  from public.social_leads l
  where l.platform=coalesce(p_row->>'platform','tiktok')
    and l.status <> 'invalid'
    and (
      ((p_row->>'tiktok_user_id') is not null and l.tiktok_user_id=p_row->>'tiktok_user_id')
      or (((p_row->>'tiktok_user_id') is null or p_row->>'tiktok_user_id'='') and lower(l.username)=lower(p_row->>'username'))
    )
  order by l.last_seen_at desc
  limit 1;

  if v_lead_id is null then
    insert into public.social_leads(
      platform,source_event_id,tiktok_user_id,username,display_name,source_type,source_account,source_url,source_content_id,original_text,
      intent_label,intent_score,status,market_country_code,market_city,geo_confidence,metadata,first_seen_at,last_seen_at,occurrence_count,
      public_phone,public_whatsapp,public_email,public_contact_source,public_contact_confidence,public_contact_checked_at
    ) values (
      coalesce(p_row->>'platform','tiktok'),p_row->>'source_event_id',nullif(p_row->>'tiktok_user_id',''),p_row->>'username',p_row->>'display_name',
      p_row->>'source_type',p_row->>'source_account',p_row->>'source_url',p_row->>'source_content_id',p_row->>'original_text',
      p_row->>'intent_label',v_incoming_score,v_incoming_status,coalesce(p_row->>'market_country_code',p_row->>'detected_country_code','CI'),
      coalesce(p_row->>'market_city',p_row->>'detected_city','Abidjan'),coalesce((p_row->>'geo_confidence')::int,0),
      coalesce(p_row->'metadata','{}'::jsonb) || jsonb_build_object('market_scope',coalesce(p_row->>'market_scope','abidjan_auto')),
      coalesce((p_row->>'first_seen_at')::timestamptz,now()),coalesce((p_row->>'last_seen_at')::timestamptz,now()),1,
      nullif(p_row->>'public_phone',''),nullif(p_row->>'public_whatsapp',''),nullif(p_row->>'public_email',''),nullif(p_row->>'public_contact_source',''),
      coalesce((p_row->>'public_contact_confidence')::int,0),case when p_row ? 'public_contact_checked_at' then (p_row->>'public_contact_checked_at')::timestamptz else null end
    ) returning id into v_lead_id;
    v_new_master := true;
  else
    update public.social_leads set
      tiktok_user_id=coalesce(tiktok_user_id,nullif(p_row->>'tiktok_user_id','')),
      display_name=coalesce(nullif(p_row->>'display_name',''),display_name),
      source_type=p_row->>'source_type',source_account=p_row->>'source_account',source_url=p_row->>'source_url',source_content_id=p_row->>'source_content_id',
      original_text=case when v_incoming_score >= intent_score then p_row->>'original_text' else original_text end,
      intent_label=case when v_incoming_score >= intent_score then p_row->>'intent_label' else intent_label end,
      intent_score=greatest(intent_score,v_incoming_score),
      status=case when status in ('assigned','contact_attempted','replied','contact_captured','converted') then status when greatest(intent_score,v_incoming_score)>=80 then 'high_intent' else status end,
      occurrence_count=occurrence_count+1,
      last_seen_at=greatest(last_seen_at,coalesce((p_row->>'last_seen_at')::timestamptz,now())),
      market_country_code=coalesce(p_row->>'market_country_code',p_row->>'detected_country_code',market_country_code),
      market_city=coalesce(p_row->>'market_city',p_row->>'detected_city',market_city),
      geo_confidence=greatest(geo_confidence,coalesce((p_row->>'geo_confidence')::int,0)),
      public_phone=coalesce(nullif(p_row->>'public_phone',''),public_phone),
      public_whatsapp=coalesce(nullif(p_row->>'public_whatsapp',''),public_whatsapp),
      public_email=coalesce(nullif(p_row->>'public_email',''),public_email),
      public_contact_source=coalesce(nullif(p_row->>'public_contact_source',''),public_contact_source),
      public_contact_confidence=greatest(public_contact_confidence,coalesce((p_row->>'public_contact_confidence')::int,0)),
      public_contact_checked_at=coalesce(case when p_row ? 'public_contact_checked_at' then (p_row->>'public_contact_checked_at')::timestamptz else null end,public_contact_checked_at),
      metadata=metadata || jsonb_build_object('latest_signal',coalesce(p_row->'metadata','{}'::jsonb),'market_scope',coalesce(p_row->>'market_scope','abidjan_auto')),
      updated_at=now()
    where id=v_lead_id;
  end if;

  insert into public.social_lead_signals(
    lead_id,platform,source_event_id,source_type,source_account,source_url,source_content_id,original_text,intent_label,intent_score,occurred_at,metadata
  ) values (
    v_lead_id,coalesce(p_row->>'platform','tiktok'),p_row->>'source_event_id',p_row->>'source_type',p_row->>'source_account',p_row->>'source_url',
    p_row->>'source_content_id',p_row->>'original_text',p_row->>'intent_label',v_incoming_score,
    coalesce((p_row->>'last_seen_at')::timestamptz,now()),coalesce(p_row->'metadata','{}'::jsonb)
  );

  return v_new_master;
end;
$$;
