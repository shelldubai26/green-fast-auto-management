-- Green Fast Auto phone normalization
-- Goal: store international numbers in E.164, default only unambiguous Côte d'Ivoire local mobile numbers to +225.

create or replace function public.gf_normalize_phone_e164(p_input text, p_default_country text default 'CI')
returns text
language plpgsql
immutable
as $$
declare
  raw text := trim(coalesce(p_input,''));
  digits text;
  cc text := upper(coalesce(nullif(trim(p_default_country),''),'CI'));
begin
  if raw = '' then return null; end if;
  raw := regexp_replace(raw, '[^0-9+]', '', 'g');

  if raw like '+%' then
    digits := regexp_replace(raw, '[^0-9]', '', 'g');
    if length(digits) < 8 or length(digits) > 15 then return null; end if;
    return '+' || digits;
  end if;

  digits := regexp_replace(raw, '[^0-9]', '', 'g');

  if digits like '00%' then
    digits := substr(digits,3);
    if length(digits) < 8 or length(digits) > 15 then return null; end if;
    return '+' || digits;
  end if;

  -- Preserve common already-international numbers even if users omit '+'.
  if digits ~ '^(225|33|44|49|86|971|1)[0-9]{6,}$' then
    if length(digits) > 15 then return null; end if;
    return '+' || digits;
  end if;

  -- Côte d’Ivoire local mobile numbers: 10 digits, beginning 01 / 05 / 07.
  if cc = 'CI' and digits ~ '^(01|05|07)[0-9]{8}$' then
    return '+225' || digits;
  end if;

  -- Never guess the country for ambiguous numbers.
  return null;
end $$;

create or replace function public.gf_phone_dedupe_key(p_input text, p_default_country text default 'CI')
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(public.gf_normalize_phone_e164(p_input,p_default_country),''),'[^0-9]','','g')
$$;

create or replace function public.gf_set_employee_bio_whatsapp(p_profile_id uuid, p_destination text, p_mode text default 'personal')
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  normalized text;
  destination_digits text;
  caller_role text;
begin
  select role into caller_role from public.profiles where id=auth.uid() and active=true;
  if auth.uid() is null or (auth.uid()<>p_profile_id and caller_role<>'owner') then raise exception 'not authorized'; end if;
  if p_mode<>'personal' then raise exception 'employee bio links cannot use official WhatsApp'; end if;

  normalized:=public.gf_normalize_phone_e164(p_destination,'CI');
  if normalized is null then raise exception 'valid international or Côte d''Ivoire WhatsApp required'; end if;
  destination_digits:=regexp_replace(normalized,'[^0-9]','','g');
  if destination_digits='2250700737118' then raise exception 'company official WhatsApp is reserved for official company accounts'; end if;

  update public.profiles set whatsapp=normalized where id=p_profile_id;
  update public.employee_bio_links set destination=destination_digits,whatsapp_mode='personal',updated_at=now() where profile_id=p_profile_id;
  perform public.gf_refresh_employee_bio_link(p_profile_id);
  return true;
end $$;

create or replace function public.gf_capture_employee_bio_lead(p_code text, p_full_name text, p_whatsapp text, p_interested_model text default null)
returns table(customer_id uuid, employee_name text, destination text, tracking_code text)
language plpgsql
security definer
set search_path='public'
as $$
declare
  b public.employee_bio_links;
  p_name text;
  c_id uuid;
  normalized text;
  dedupe text;
  temp_name text;
begin
  select * into b from public.employee_bio_links where upper(code)=upper(trim(p_code)) and active=true limit 1;
  if b.id is null then raise exception 'invalid employee bio code'; end if;
  if b.whatsapp_mode<>'personal' then raise exception 'employee link must use personal WhatsApp'; end if;
  if b.destination='2250700737118' then raise exception 'employee personal WhatsApp is not configured'; end if;

  select full_name into p_name from public.profiles where id=b.profile_id and active=true;
  if p_name is null then raise exception 'employee unavailable'; end if;

  normalized:=public.gf_normalize_phone_e164(p_whatsapp,'CI');
  if normalized is null then raise exception 'valid international or Côte d''Ivoire WhatsApp required'; end if;
  dedupe:=regexp_replace(normalized,'[^0-9]','','g');
  temp_name:=coalesce(nullif(trim(p_full_name),''),'TikTok Lead · '||right(dedupe,4));

  select c.id into c_id from public.customers c
   where c.assigned_to=b.profile_id
     and public.gf_phone_dedupe_key(coalesce(c.whatsapp,c.phone),'CI')=dedupe
   order by c.created_at desc limit 1;

  if c_id is null then
    insert into public.customers(full_name,phone,whatsapp,lead_source,source,lead_type,interested_model,assigned_to,assigned_sales,assigned_at,stage,behavior_summary)
    values(temp_name,normalized,normalized,'tiktok','TikTok Bio','active',nullif(trim(p_interested_model),''),b.profile_id,b.profile_id,now(),'new',jsonb_build_object('employee_bio_code',b.code,'source_level','employee_account','captured_at',now(),'phone_e164',normalized)) returning id into c_id;
    update public.employee_bio_links set leads=leads+1,updated_at=now() where id=b.id;
  else
    update public.customers set
      whatsapp=normalized,
      phone=coalesce(phone,normalized),
      lead_source=coalesce(lead_source,'tiktok'),
      source=coalesce(source,'TikTok Bio'),
      assigned_sales=coalesce(assigned_sales,b.profile_id),
      behavior_summary=coalesce(behavior_summary,'{}'::jsonb)||jsonb_build_object('employee_bio_code',b.code,'source_level','employee_account','last_bio_touch_at',now(),'phone_e164',normalized)
    where id=c_id;
  end if;

  return query select c_id,p_name,b.destination,b.code;
end $$;

create or replace function public.gf_public_capture_content_lead(p_code text, p_name text, p_whatsapp text, p_model text default null)
returns table(customer_id uuid, profile_id uuid, content_id uuid, whatsapp_destination text)
language plpgsql
security definer
set search_path='public'
as $$
declare
  l public.content_tracking_links;
  c public.contents;
  tv public.tiktok_videos;
  ta public.tiktok_accounts;
  p public.profiles;
  cid uuid;
  normalized text;
  dedupe text;
  dest text;
  temp_name text;
begin
  normalized:=public.gf_normalize_phone_e164(p_whatsapp,'CI');
  if normalized is null then raise exception 'valid international or Côte d''Ivoire WhatsApp required'; end if;
  dedupe:=regexp_replace(normalized,'[^0-9]','','g');
  temp_name:=coalesce(nullif(trim(p_name),''),'TikTok Lead · '||right(dedupe,4));

  select ctl.* into l from public.content_tracking_links ctl where upper(ctl.code)=upper(trim(p_code)) and ctl.active=true limit 1;
  if l.id is null then raise exception 'invalid tracking code'; end if;
  select ct.* into c from public.contents ct where ct.id=l.content_id;
  select pr.* into p from public.profiles pr where pr.id=l.profile_id and pr.active=true;
  if p.id is null then raise exception 'seller unavailable'; end if;
  select v.* into tv from public.tiktok_videos v where v.profile_id=l.profile_id and v.video_id=c.external_ref limit 1;
  if tv.id is null then raise exception 'video unavailable'; end if;
  select a.* into ta from public.tiktok_accounts a where a.id=tv.tiktok_account_id limit 1;

  if ta.account_kind='official' then
    dest:='2250700737118';
  else
    dest:=regexp_replace(coalesce(public.gf_normalize_phone_e164(p.whatsapp,'CI'),''),'[^0-9]','','g');
    if length(dest)<8 or dest='2250700737118' then raise exception 'seller personal WhatsApp is not configured'; end if;
  end if;

  select cu.id into cid from public.customers cu
   where public.gf_phone_dedupe_key(coalesce(cu.whatsapp,cu.phone),'CI')=dedupe
   order by cu.created_at desc limit 1;

  if cid is null then
    insert into public.customers(name,full_name,phone,whatsapp,source,lead_source,stage,assigned_sales,assigned_to,assigned_at,interested_model,notes,behavior_summary,last_behavior_at)
    values(temp_name,temp_name,normalized,normalized,'TikTok Content','TikTok Content','new',l.profile_id,l.profile_id,now(),nullif(trim(coalesce(p_model,'')),''),'Captured via Green Fast TikTok tracking gateway',jsonb_build_object('content_tracking_code',l.code,'content_id',l.content_id,'tiktok_video_id',c.external_ref,'tiktok_account_kind',coalesce(ta.account_kind,'employee'),'phone_e164',normalized),now()) returning id into cid;
  else
    update public.customers cu set
      whatsapp=normalized,
      phone=coalesce(cu.phone,normalized),
      source=coalesce(cu.source,'TikTok Content'),
      lead_source=coalesce(cu.lead_source,'TikTok Content'),
      assigned_sales=coalesce(cu.assigned_sales,l.profile_id),
      assigned_to=coalesce(cu.assigned_to,l.profile_id),
      interested_model=coalesce(cu.interested_model,nullif(trim(coalesce(p_model,'')),'')),
      behavior_summary=coalesce(cu.behavior_summary,'{}'::jsonb)||jsonb_build_object('content_tracking_code',l.code,'content_id',l.content_id,'tiktok_video_id',c.external_ref,'tiktok_account_kind',coalesce(ta.account_kind,'employee'),'phone_e164',normalized),
      last_behavior_at=now()
    where cu.id=cid;
  end if;

  insert into public.tiktok_content_attribution(video_row_id,content_id,profile_id,customer_id,captured_at,attribution_role,attribution_method)
  values(tv.id,l.content_id,l.profile_id,cid,now(),'primary','tracked_gateway')
  on conflict on constraint tiktok_content_attribution_video_row_id_customer_id_key do update set content_id=excluded.content_id,profile_id=excluded.profile_id,attribution_method='tracked_gateway',updated_at=now();

  perform public.gf_refresh_tiktok_customer(cid);
  return query select cid,l.profile_id,l.content_id,dest;
end $$;
