create or replace function public.gf_public_capture_content_lead(
  p_code text,
  p_name text,
  p_whatsapp text,
  p_model text default null
)
returns table(customer_id uuid, profile_id uuid, content_id uuid, whatsapp_destination text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l public.content_tracking_links;
  c public.contents;
  tv public.tiktok_videos;
  ta public.tiktok_accounts;
  p public.profiles;
  cid uuid;
  digits text;
  dest text;
  display_name text;
begin
  digits:=regexp_replace(coalesce(p_whatsapp,''),'[^0-9]','','g');
  if length(digits)<8 then raise exception 'valid whatsapp required'; end if;
  display_name:=coalesce(nullif(trim(coalesce(p_name,'')),''),'TikTok Lead · '||right(digits,4));

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
    dest:=regexp_replace(coalesce(p.whatsapp,''),'[^0-9]','','g');
    if length(dest)<8 or dest='2250700737118' then raise exception 'seller personal WhatsApp is not configured'; end if;
  end if;

  select cu.id into cid from public.customers cu
  where regexp_replace(coalesce(cu.whatsapp,cu.phone,''),'[^0-9]','','g')=digits
  order by cu.created_at desc limit 1;

  if cid is null then
    insert into public.customers(name,full_name,phone,whatsapp,source,lead_source,stage,assigned_sales,assigned_to,assigned_at,interested_model,notes,behavior_summary,last_behavior_at)
    values(display_name,display_name,digits,digits,'TikTok Content','TikTok Content','new',l.profile_id,l.profile_id,now(),nullif(trim(coalesce(p_model,'')),''),'Captured via Green Fast TikTok tracking gateway',jsonb_build_object('content_tracking_code',l.code,'content_id',l.content_id,'tiktok_video_id',c.external_ref,'tiktok_account_kind',coalesce(ta.account_kind,'employee'),'capture_mode','one_field_whatsapp'),now())
    returning id into cid;
  else
    update public.customers cu set
      source=coalesce(cu.source,'TikTok Content'),
      lead_source=coalesce(cu.lead_source,'TikTok Content'),
      assigned_sales=coalesce(cu.assigned_sales,l.profile_id),
      assigned_to=coalesce(cu.assigned_to,l.profile_id),
      interested_model=coalesce(cu.interested_model,nullif(trim(coalesce(p_model,'')),'')),
      behavior_summary=coalesce(cu.behavior_summary,'{}'::jsonb)||jsonb_build_object('content_tracking_code',l.code,'content_id',l.content_id,'tiktok_video_id',c.external_ref,'tiktok_account_kind',coalesce(ta.account_kind,'employee'),'capture_mode','one_field_whatsapp'),
      last_behavior_at=now()
    where cu.id=cid;
  end if;

  insert into public.tiktok_content_attribution(video_row_id,content_id,profile_id,customer_id,captured_at,attribution_role,attribution_method)
  values(tv.id,l.content_id,l.profile_id,cid,now(),'primary','tracked_gateway')
  on conflict on constraint tiktok_content_attribution_video_row_id_customer_id_key
  do update set content_id=excluded.content_id,profile_id=excluded.profile_id,attribution_method='tracked_gateway',updated_at=now();

  perform public.gf_refresh_tiktok_customer(cid);
  return query select cid,l.profile_id,l.content_id,dest;
end
$function$;

create or replace function public.gf_capture_employee_bio_lead(
  p_code text,
  p_full_name text,
  p_whatsapp text,
  p_interested_model text default null
)
returns table(customer_id uuid, employee_name text, destination text, tracking_code text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b public.employee_bio_links;
  p_name text;
  c_id uuid;
  clean_phone text;
  display_name text;
begin
  select * into b from public.employee_bio_links where upper(code)=upper(trim(p_code)) and active=true limit 1;
  if b.id is null then raise exception 'invalid employee bio code'; end if;
  if b.whatsapp_mode<>'personal' then raise exception 'employee link must use personal WhatsApp'; end if;
  if b.destination='2250700737118' then raise exception 'employee personal WhatsApp is not configured'; end if;

  select full_name into p_name from public.profiles where id=b.profile_id and active=true;
  if p_name is null then raise exception 'employee unavailable'; end if;

  clean_phone:=regexp_replace(coalesce(p_whatsapp,''),'[^0-9+]','','g');
  if length(regexp_replace(clean_phone,'[^0-9]','','g'))<8 then raise exception 'invalid whatsapp'; end if;
  display_name:=coalesce(nullif(trim(coalesce(p_full_name,'')),''),'TikTok Lead · '||right(regexp_replace(clean_phone,'[^0-9]','','g'),4));

  select c.id into c_id from public.customers c
  where c.assigned_to=b.profile_id and (
    regexp_replace(coalesce(c.whatsapp,''),'[^0-9+]','','g')=clean_phone or
    regexp_replace(coalesce(c.phone,''),'[^0-9+]','','g')=clean_phone
  ) order by c.created_at desc limit 1;

  if c_id is null then
    insert into public.customers(full_name,phone,whatsapp,lead_source,source,lead_type,interested_model,assigned_to,assigned_sales,assigned_at,stage,behavior_summary)
    values(display_name,clean_phone,clean_phone,'tiktok','TikTok Bio','active',nullif(trim(p_interested_model),''),b.profile_id,b.profile_id,now(),'new',jsonb_build_object('employee_bio_code',b.code,'source_level','employee_account','capture_mode','one_field_whatsapp','captured_at',now()))
    returning id into c_id;
    update public.employee_bio_links set leads=leads+1,updated_at=now() where id=b.id;
  else
    update public.customers set
      lead_source=coalesce(lead_source,'tiktok'),
      source=coalesce(source,'TikTok Bio'),
      assigned_sales=coalesce(assigned_sales,b.profile_id),
      behavior_summary=coalesce(behavior_summary,'{}'::jsonb)||jsonb_build_object('employee_bio_code',b.code,'source_level','employee_account','capture_mode','one_field_whatsapp','last_bio_touch_at',now())
    where id=c_id;
  end if;

  return query select c_id,p_name,b.destination,b.code;
end
$function$;
