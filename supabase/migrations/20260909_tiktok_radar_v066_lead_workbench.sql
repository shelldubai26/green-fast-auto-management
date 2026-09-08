-- TikTok Radar V0.6.6 — assignment + CRM prospect workbench
alter table public.social_leads add column if not exists assignment_target_role text check (assignment_target_role in ('manager','sales'));
alter table public.social_leads add column if not exists assigned_by uuid references public.profiles(id);
alter table public.social_leads add column if not exists manager_id uuid references public.profiles(id);
alter table public.social_leads add column if not exists lead_quality text check (lead_quality in ('hot','valid','long_term','invalid'));
alter table public.social_leads add column if not exists next_follow_up_at timestamptz;
alter table public.social_leads add column if not exists invalid_reason text;
alter table public.social_leads add column if not exists invalid_at timestamptz;
alter table public.social_leads add column if not exists purge_after timestamptz;
alter table public.social_leads add column if not exists last_sales_action_at timestamptz;
alter table public.radar_worker_config add column if not exists auto_lead_assignment_enabled boolean not null default true;
create index if not exists social_leads_assigned_at_idx on public.social_leads(assigned_at desc);
create index if not exists social_leads_manager_idx on public.social_leads(manager_id,assigned_at desc);
create index if not exists social_leads_quality_idx on public.social_leads(lead_quality,next_follow_up_at);

drop policy if exists social_leads_read on public.social_leads;
create policy social_leads_read on public.social_leads for select to authenticated using (
 public.current_role()='owner'::app_role or
 (public.current_role()='manager'::app_role and (manager_id=auth.uid() or assigned_to=auth.uid())) or
 (public.current_role()='sales'::app_role and assigned_to=auth.uid())
);
drop policy if exists social_leads_update on public.social_leads;
create policy social_leads_update on public.social_leads for update to authenticated using (
 public.current_role()='owner'::app_role or
 (public.current_role()='manager'::app_role and (manager_id=auth.uid() or assigned_to=auth.uid())) or
 (public.current_role()='sales'::app_role and assigned_to=auth.uid())
) with check (
 public.current_role()='owner'::app_role or
 (public.current_role()='manager'::app_role and manager_id=auth.uid()) or
 (public.current_role()='sales'::app_role and assigned_to=auth.uid())
);

create or replace function public.gfauto_manager_sales() returns table(id uuid,full_name text)
language sql stable security definer set search_path=public as $$
 select distinct p.id,p.full_name from sales_teams t join sales_team_members m on m.team_id=t.id join profiles p on p.id=m.profile_id
 where t.active=true and t.manager_id=auth.uid() and p.role='sales' and coalesce(p.active,true)=true order by p.full_name;
$$;
grant execute on function public.gfauto_manager_sales() to authenticated;

create or replace function public.gfauto_assign_social_lead(p_lead_id uuid,p_target_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_actor_role text;v_target_role text;v_in_team boolean:=false;
begin
 select role::text into v_actor_role from profiles where id=v_actor;
 select role::text into v_target_role from profiles where id=p_target_id and coalesce(active,true)=true;
 if v_actor_role='owner' and v_target_role in ('manager','sales') then
  update social_leads set assigned_to=p_target_id,assignment_target_role=v_target_role,manager_id=case when v_target_role='manager' then p_target_id else null end,assigned_by=v_actor,assigned_at=now(),status='assigned',updated_at=now() where id=p_lead_id;
 elsif v_actor_role='manager' and v_target_role='sales' then
  select exists(select 1 from sales_teams t join sales_team_members m on m.team_id=t.id where t.active=true and t.manager_id=v_actor and m.profile_id=p_target_id) into v_in_team;
  if not v_in_team then raise exception 'sales_not_in_manager_team'; end if;
  update social_leads set assigned_to=p_target_id,assignment_target_role='sales',manager_id=v_actor,assigned_by=v_actor,assigned_at=now(),status='assigned',updated_at=now() where id=p_lead_id and manager_id=v_actor;
  if not found then raise exception 'lead_not_in_manager_pool'; end if;
 else raise exception 'not_authorized'; end if;
end $$;
grant execute on function public.gfauto_assign_social_lead(uuid,uuid) to authenticated;

create or replace function public.gfauto_classify_social_lead(p_lead_id uuid,p_quality text,p_next_follow_up_at timestamptz default null,p_invalid_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_role text;
begin
 select role::text into v_role from profiles where id=v_actor;
 if p_quality not in ('hot','valid','long_term','invalid') then raise exception 'invalid_quality'; end if;
 if p_quality='long_term' and p_next_follow_up_at is null then raise exception 'follow_up_date_required'; end if;
 update social_leads set lead_quality=p_quality,next_follow_up_at=case when p_quality='long_term' then p_next_follow_up_at else null end,invalid_reason=case when p_quality='invalid' then nullif(trim(p_invalid_reason),'') else null end,invalid_at=case when p_quality='invalid' then now() else null end,purge_after=case when p_quality='invalid' then now()+interval '30 days' else null end,last_sales_action_at=now(),updated_at=now(),status=case when p_quality='invalid' then 'invalid' else status end
 where id=p_lead_id and (v_role='owner' or (v_role='manager' and manager_id=v_actor) or (v_role='sales' and assigned_to=v_actor));
 if not found then raise exception 'not_authorized'; end if;
end $$;
grant execute on function public.gfauto_classify_social_lead(uuid,text,timestamptz,text) to authenticated;

create or replace function public.gfauto_auto_assign_new_social_lead() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_sales uuid;v_manager uuid;v_enabled boolean;
begin
 select auto_lead_assignment_enabled into v_enabled from radar_worker_config limit 1;
 if coalesce(v_enabled,true)=false then return new; end if;
 select p.id into v_sales from profiles p left join lateral (select count(*) c from social_leads l where l.assigned_to=p.id and l.status not in ('converted','invalid')) x on true
 where p.role='sales' and coalesce(p.active,true)=true order by x.c asc,p.created_at asc limit 1;
 if v_sales is not null then
  select t.manager_id into v_manager from sales_teams t join sales_team_members m on m.team_id=t.id where t.active=true and m.profile_id=v_sales order by t.created_at asc limit 1;
  update social_leads set assigned_to=v_sales,assignment_target_role='sales',manager_id=v_manager,assigned_at=now(),status='assigned',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('assignment_mode','auto','assignment_version','0.6.6') where id=new.id;
 end if;
 return new;
end $$;
drop trigger if exists trg_social_lead_auto_assign on public.social_leads;
create trigger trg_social_lead_auto_assign after insert on public.social_leads for each row execute function public.gfauto_auto_assign_new_social_lead();

create or replace function public.gfauto_purge_invalid_social_leads() returns integer language plpgsql security definer set search_path=public as $$
declare n integer;begin delete from social_leads where lead_quality='invalid' and purge_after is not null and purge_after<=now();get diagnostics n=row_count;return n;end $$;
revoke all on function public.gfauto_purge_invalid_social_leads() from public,authenticated;
