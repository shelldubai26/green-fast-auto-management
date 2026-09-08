create or replace function public.gfauto_bulk_assign_social_leads(p_lead_ids uuid[], p_target_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_target_role text;
  v_count integer:=0;
  v_id uuid;
begin
  if p_lead_ids is null or coalesce(array_length(p_lead_ids,1),0)=0 then return 0; end if;
  if array_length(p_lead_ids,1)>100 then raise exception 'too_many_leads'; end if;
  select role::text into v_actor_role from profiles where id=v_actor;
  select role::text into v_target_role from profiles where id=p_target_id and coalesce(active,true)=true;
  if v_actor_role <> 'owner' then raise exception 'not_authorized'; end if;
  if v_target_role not in ('manager','sales') then raise exception 'invalid_target'; end if;
  foreach v_id in array p_lead_ids loop
    update social_leads
    set assigned_to=p_target_id,
        assignment_target_role=v_target_role,
        manager_id=case when v_target_role='manager' then p_target_id else null end,
        assigned_by=v_actor,
        assigned_at=now(),
        status='assigned',
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('assignment_mode','owner_bulk','assignment_version','0.6.8')
    where id=v_id and status not in ('converted','invalid');
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end $$;
grant execute on function public.gfauto_bulk_assign_social_leads(uuid[],uuid) to authenticated;
