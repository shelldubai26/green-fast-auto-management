-- LIVE SALES AI V0.7.4
-- Employee TikTok Bio Link automation.
-- Employee links activate only when:
-- 1) active sales/manager profile
-- 2) connected TikTok account marked account_kind='employee'
-- 3) valid personal WhatsApp different from Green Fast official number

create or replace function public.gf_refresh_employee_bio_link(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.profiles;
  has_employee_tiktok boolean:=false;
  clean_whatsapp text;
  code_value text;
begin
  select * into p from public.profiles where id=p_profile_id;
  if p.id is null then return; end if;

  select exists(
    select 1 from public.tiktok_accounts t
    where t.profile_id=p_profile_id
      and t.token_status='connected'
      and coalesce(t.account_kind,'employee')='employee'
  ) into has_employee_tiktok;

  clean_whatsapp:=regexp_replace(coalesce(p.whatsapp,''),'[^0-9]','','g');

  if p.active=true and p.role in ('sales','manager') then
    code_value:='GF-'||upper(regexp_replace(substr(coalesce(nullif(p.full_name,''),'SALES'),1,12),'[^A-Za-z0-9]','','g'))||'-'||upper(substr(replace(p.id::text,'-',''),1,4));
    insert into public.employee_bio_links(profile_id,code,destination,whatsapp_mode,active,updated_at)
    values(
      p.id,
      code_value,
      case when length(clean_whatsapp)>=8 then clean_whatsapp else '2250700737118' end,
      'personal',
      (has_employee_tiktok and length(clean_whatsapp)>=8 and clean_whatsapp<>'2250700737118'),
      now()
    )
    on conflict(profile_id) do update set
      code=excluded.code,
      destination=excluded.destination,
      whatsapp_mode='personal',
      active=(has_employee_tiktok and length(clean_whatsapp)>=8 and clean_whatsapp<>'2250700737118'),
      updated_at=now();
  else
    update public.employee_bio_links set active=false,updated_at=now() where profile_id=p.id;
  end if;
end $$;

create or replace function public.gf_profiles_refresh_bio_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.gf_refresh_employee_bio_link(new.id);
  return new;
end $$;

drop trigger if exists trg_profiles_refresh_bio on public.profiles;
create trigger trg_profiles_refresh_bio
after insert or update of full_name,role,whatsapp,active on public.profiles
for each row execute function public.gf_profiles_refresh_bio_trigger();

create or replace function public.gf_tiktok_refresh_bio_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.gf_refresh_employee_bio_link(coalesce(new.profile_id,old.profile_id));
  return coalesce(new,old);
end $$;

drop trigger if exists trg_tiktok_accounts_refresh_bio on public.tiktok_accounts;
create trigger trg_tiktok_accounts_refresh_bio
after insert or update of token_status,profile_id,account_kind or delete on public.tiktok_accounts
for each row execute function public.gf_tiktok_refresh_bio_trigger();
