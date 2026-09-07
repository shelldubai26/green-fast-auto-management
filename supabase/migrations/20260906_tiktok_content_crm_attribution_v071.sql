alter table public.contents add column if not exists external_ref text;
alter table public.contents add column if not exists source_kind text;
alter table public.contents add column if not exists source_profile_id uuid references public.profiles(id);
create unique index if not exists contents_platform_external_ref_uidx on public.contents(platform,external_ref) where external_ref is not null;

create table if not exists public.tiktok_content_attribution (
  id uuid primary key default gen_random_uuid(),
  video_row_id uuid not null references public.tiktok_videos(id) on delete cascade,
  content_id uuid references public.contents(id) on delete set null,
  profile_id uuid not null references public.profiles(id),
  customer_id uuid not null references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  captured_at timestamptz not null default now(),
  first_contact_at timestamptz, visited_at timestamptz, deposit_at timestamptz, signed_at timestamptz,
  sold_at timestamptz, sale_price_xof numeric,
  attribution_role text not null default 'primary' check (attribution_role in ('primary','assist')),
  attribution_method text not null default 'tracked_link',
  updated_at timestamptz not null default now(),
  unique(video_row_id,customer_id)
);

alter table public.tiktok_content_attribution enable row level security;
drop policy if exists tiktok_content_attribution_select on public.tiktok_content_attribution;
create policy tiktok_content_attribution_select on public.tiktok_content_attribution for select using (
  profile_id=auth.uid() or public.current_role()='owner'::public.app_role or
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='manager'::public.app_role and p.manager_scope='store') or
  exists(select 1 from public.sales_teams st join public.sales_team_members stm on stm.team_id=st.id where st.manager_id=auth.uid() and stm.profile_id=tiktok_content_attribution.profile_id)
);

create or replace function public.gf_sync_tiktok_video_to_content() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.contents(creator,platform,content_type,title,url,published_at,views,leads_count,visits_count,sales_count,external_ref,source_kind,source_profile_id)
 values(new.profile_id,'tiktok','video',coalesce(nullif(new.title,''),nullif(new.video_description,''),'TikTok video'),new.embed_link,new.create_time,coalesce(new.view_count,0),0,0,0,new.video_id,'tiktok_authorized',new.profile_id)
 on conflict (platform,external_ref) where external_ref is not null do update set creator=excluded.creator,title=excluded.title,url=excluded.url,published_at=excluded.published_at,views=excluded.views,source_profile_id=excluded.source_profile_id;
 return new;
end$$;

drop trigger if exists trg_sync_tiktok_video_to_content on public.tiktok_videos;
create trigger trg_sync_tiktok_video_to_content after insert or update of title,video_description,embed_link,create_time,view_count on public.tiktok_videos for each row execute function public.gf_sync_tiktok_video_to_content();

create or replace function public.gf_refresh_tiktok_customer(p_customer_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 update public.tiktok_content_attribution a set first_contact_at=c.first_contact_at,visited_at=c.visited_at,deposit_at=c.deposit_at,signed_at=c.signed_at,sale_id=s.id,sold_at=s.sold_at,sale_price_xof=s.sale_price_xof,updated_at=now()
 from public.customers c left join lateral (select s1.* from public.sales s1 where s1.customer_id=c.id order by coalesce(s1.sold_at,s1.created_at) desc limit 1) s on true
 where a.customer_id=c.id and c.id=p_customer_id;
 update public.contents ct set leads_count=(select count(distinct a.customer_id) from public.tiktok_content_attribution a where a.content_id=ct.id),visits_count=(select count(distinct a.customer_id) from public.tiktok_content_attribution a where a.content_id=ct.id and a.visited_at is not null),sales_count=(select count(distinct a.customer_id) from public.tiktok_content_attribution a where a.content_id=ct.id and a.sale_id is not null and a.attribution_role='primary')
 where ct.id in (select distinct a.content_id from public.tiktok_content_attribution a where a.customer_id=p_customer_id and a.content_id is not null);
end$$;

create or replace function public.gf_attach_customer_to_tiktok_video(p_video_row_id uuid,p_customer_id uuid,p_method text default 'manual_crm') returns uuid language plpgsql security definer set search_path=public as $$
declare v_profile uuid;v_content uuid;v_id uuid;v_role text;begin
 select profile_id into v_profile from public.tiktok_videos where id=p_video_row_id;if v_profile is null then raise exception 'video_not_found';end if;
 if not (auth.uid()=v_profile or public.current_role()='owner'::public.app_role or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='manager'::public.app_role and p.manager_scope='store') or exists(select 1 from public.sales_teams st join public.sales_team_members stm on stm.team_id=st.id where st.manager_id=auth.uid() and stm.profile_id=v_profile)) then raise exception 'forbidden';end if;
 select id into v_content from public.contents where platform='tiktok' and external_ref=(select video_id from public.tiktok_videos where id=p_video_row_id) limit 1;
 v_role:=case when exists(select 1 from public.tiktok_content_attribution a where a.customer_id=p_customer_id and a.attribution_role='primary') then 'assist' else 'primary' end;
 insert into public.tiktok_content_attribution(video_row_id,content_id,profile_id,customer_id,attribution_role,attribution_method) values(p_video_row_id,v_content,v_profile,p_customer_id,v_role,p_method) on conflict(video_row_id,customer_id) do update set updated_at=now() returning id into v_id;
 perform public.gf_refresh_tiktok_customer(p_customer_id);return v_id;
end$$;

grant execute on function public.gf_attach_customer_to_tiktok_video(uuid,uuid,text) to authenticated;