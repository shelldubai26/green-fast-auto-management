-- V0.6.6 fallback while only one active sales manager exists.
create or replace function public.gfauto_manager_sales() returns table(id uuid,full_name text)
language sql stable security definer set search_path=public as $$
 with direct_team as (
  select distinct p.id,p.full_name from sales_teams t join sales_team_members m on m.team_id=t.id join profiles p on p.id=m.profile_id
  where t.active=true and t.manager_id=auth.uid() and p.role='sales' and coalesce(p.active,true)=true
 ), one_manager as (select count(*)=1 only_one from profiles where role='manager' and coalesce(active,true)=true)
 select * from direct_team
 union all
 select p.id,p.full_name from profiles p,one_manager o
 where not exists(select 1 from direct_team) and o.only_one and exists(select 1 from profiles me where me.id=auth.uid() and me.role='manager') and p.role='sales' and coalesce(p.active,true)=true
 order by full_name;
$$;
grant execute on function public.gfauto_manager_sales() to authenticated;

create or replace function public.gfauto_auto_assign_new_social_lead() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_sales uuid;v_manager uuid;v_enabled boolean;v_manager_count integer;
begin
 select auto_lead_assignment_enabled into v_enabled from radar_worker_config limit 1;
 if coalesce(v_enabled,true)=false then return new; end if;
 select p.id into v_sales from profiles p left join lateral (select count(*) c from social_leads l where l.assigned_to=p.id and l.status not in ('converted','invalid')) x on true
 where p.role='sales' and coalesce(p.active,true)=true order by x.c asc,p.created_at asc limit 1;
 if v_sales is not null then
  select t.manager_id into v_manager from sales_teams t join sales_team_members m on m.team_id=t.id where t.active=true and m.profile_id=v_sales order by t.created_at asc limit 1;
  if v_manager is null then select count(*) into v_manager_count from profiles where role='manager' and coalesce(active,true)=true; if v_manager_count=1 then select id into v_manager from profiles where role='manager' and coalesce(active,true)=true limit 1; end if; end if;
  update social_leads set assigned_to=v_sales,assignment_target_role='sales',manager_id=v_manager,assigned_at=now(),status='assigned',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('assignment_mode','auto','assignment_version','0.6.6') where id=new.id;
 end if;
 return new;
end $$;
