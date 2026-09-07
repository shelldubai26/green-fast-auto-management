create table if not exists public.seller_ai_daily_plans (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null default current_date,
  target_new_prospects integer not null default 0,
  recommended_videos integer not null default 0,
  recommended_live_minutes integer not null default 0,
  recommended_crm_followups integer not null default 0,
  open_crm_backlog integer not null default 0,
  overdue_followups integer not null default 0,
  today_tiktok_leads integer not null default 0,
  today_videos integer not null default 0,
  confidence text not null default 'low' check (confidence in ('low','medium','high')),
  basis text not null default 'internal_execution_heuristic',
  rationale text,
  calculated_at timestamptz not null default now(),
  primary key(profile_id,plan_date)
);
alter table public.seller_ai_daily_plans enable row level security;
drop policy if exists seller_ai_daily_plans_select on public.seller_ai_daily_plans;
create policy seller_ai_daily_plans_select on public.seller_ai_daily_plans for select to authenticated using (public.gf_can_view_tiktok_profile(profile_id));

create or replace function public.gf_refresh_seller_daily_plan(p_profile_id uuid)
returns public.seller_ai_daily_plans
language plpgsql security definer set search_path=public as $$
declare
  t public.seller_ai_targets;
  d_in_month int:=extract(day from (date_trunc('month',current_date)+interval '1 month - 1 day'))::int;
  d_today int:=extract(day from current_date)::int;
  d_left int:=greatest(1,d_in_month-d_today+1);
  month_leads int:=0; today_tiktok int:=0; today_videos int:=0; backlog int:=0; overdue int:=0;
  new_needed int:=0; videos_needed int:=0; live_min int:=0; followups int:=0; conf text:='low'; why text; r public.seller_ai_daily_plans;
begin
  if auth.uid() is not null and not public.gf_can_view_tiktok_profile(p_profile_id) then raise exception 'not allowed'; end if;
  t:=public.gf_refresh_seller_ai_target(p_profile_id,3);
  select count(*)::int into month_leads from public.customers where (assigned_sales=p_profile_id or assigned_to=p_profile_id) and created_at>=date_trunc('month',now());
  select count(*)::int into today_tiktok from public.customers where (assigned_sales=p_profile_id or assigned_to=p_profile_id) and created_at>=current_date and lower(coalesce(lead_source,source,'')) like '%tiktok%';
  select count(*)::int into today_videos from public.tiktok_videos where profile_id=p_profile_id and create_time>=current_date;
  select count(*)::int into backlog from public.customers where (assigned_sales=p_profile_id or assigned_to=p_profile_id) and coalesce(stage,'new') not in ('sold','lost','closed');
  select count(*)::int into overdue from public.customers where (assigned_sales=p_profile_id or assigned_to=p_profile_id) and coalesce(stage,'new') not in ('sold','lost','closed') and coalesce(next_followup,follow_up_date)<now();
  new_needed:=ceil(greatest(0,t.recommended_prospects-month_leads)::numeric/d_left)::int;
  videos_needed:=case when today_videos=0 then 1 else 0 end;
  live_min:=case when new_needed>=2 then 30 when new_needed=1 then 20 else 0 end;
  followups:=least(backlog,greatest(overdue,case when backlog>0 then 5 else 0 end));
  conf:=case when t.confidence='high' and backlog>=5 then 'high' when t.confidence in ('medium','high') or backlog>=3 then 'medium' else 'low' end;
  why:=format('Need %s new prospects today; %s open CRM leads (%s overdue); %s TikTok leads and %s videos today. Internal execution heuristic, not platform guidance.',new_needed,backlog,overdue,today_tiktok,today_videos);
  insert into public.seller_ai_daily_plans(profile_id,plan_date,target_new_prospects,recommended_videos,recommended_live_minutes,recommended_crm_followups,open_crm_backlog,overdue_followups,today_tiktok_leads,today_videos,confidence,basis,rationale,calculated_at)
  values(p_profile_id,current_date,new_needed,videos_needed,live_min,followups,backlog,overdue,today_tiktok,today_videos,conf,'internal_execution_heuristic',why,now())
  on conflict(profile_id,plan_date) do update set target_new_prospects=excluded.target_new_prospects,recommended_videos=excluded.recommended_videos,recommended_live_minutes=excluded.recommended_live_minutes,recommended_crm_followups=excluded.recommended_crm_followups,open_crm_backlog=excluded.open_crm_backlog,overdue_followups=excluded.overdue_followups,today_tiktok_leads=excluded.today_tiktok_leads,today_videos=excluded.today_videos,confidence=excluded.confidence,basis=excluded.basis,rationale=excluded.rationale,calculated_at=excluded.calculated_at returning * into r;
  return r;
end $$;
grant execute on function public.gf_refresh_seller_daily_plan(uuid) to authenticated;
