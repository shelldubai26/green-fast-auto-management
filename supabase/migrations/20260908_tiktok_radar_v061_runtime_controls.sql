-- TikTok Radar V0.6.1 — runtime master switch + public profile enrichment queue

create or replace function public.radar_worker_get_watchlist(p_token text)
returns setof public.tiktok_watchlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
begin
  if not public.radar_worker_authorized(p_token) then raise exception 'unauthorized'; end if;
  select coalesce(c.master_enabled,true) into v_enabled from public.radar_worker_config c limit 1;
  if not coalesce(v_enabled,true) then return; end if;
  return query
    select w.* from public.tiktok_watchlist w
    where w.is_active=true and w.country_code='CI' and w.city='Abidjan'
    order by w.priority desc,w.username;
end;
$$;

create or replace function public.radar_worker_get_enrichment_queue(p_token text,p_limit integer default 10)
returns table(id uuid,username text,intent_score integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := true;
  v_enrich boolean := true;
begin
  if not public.radar_worker_authorized(p_token) then raise exception 'unauthorized'; end if;
  select coalesce(c.master_enabled,true),coalesce(c.public_contact_enrichment_enabled,true)
    into v_enabled,v_enrich from public.radar_worker_config c limit 1;
  if not coalesce(v_enabled,true) or not coalesce(v_enrich,true) then return; end if;
  return query
    select l.id,l.username,l.intent_score
    from public.social_leads l
    where l.platform='tiktok'
      and l.status not in ('invalid','converted')
      and l.intent_score>=60
      and l.public_contact_checked_at is null
      and coalesce(l.username,'')<>''
    order by l.intent_score desc,l.last_seen_at desc
    limit greatest(1,least(coalesce(p_limit,10),50));
end;
$$;

create or replace function public.radar_worker_save_public_contact(p_token text,p_lead_id uuid,p_contact jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.radar_worker_authorized(p_token) then raise exception 'unauthorized'; end if;
  update public.social_leads set
    public_phone=coalesce(nullif(p_contact->>'phone',''),public_phone),
    public_whatsapp=coalesce(nullif(p_contact->>'whatsapp',''),public_whatsapp),
    public_email=coalesce(nullif(p_contact->>'email',''),public_email),
    public_contact_source=coalesce(nullif(p_contact->>'source',''),public_contact_source),
    public_contact_confidence=greatest(public_contact_confidence,coalesce((p_contact->>'confidence')::int,0)),
    public_contact_checked_at=coalesce((p_contact->>'checkedAt')::timestamptz,now()),
    updated_at=now()
  where id=p_lead_id;
  return found;
end;
$$;
