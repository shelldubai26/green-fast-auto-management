create or replace function public.gf_employee_punch(p_kind text, p_lat double precision default null, p_lng double precision default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Africa/Abidjan')::date;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_kind not in ('in','out') then raise exception 'Invalid punch type'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.active = true) then
    raise exception 'Active employee profile required';
  end if;
  if p_kind = 'in' then
    insert into public.attendance_records(employee_id,work_date,clock_in_at,clock_in_lat,clock_in_lng,status)
    values(v_uid,v_day,now(),p_lat,p_lng,'present')
    on conflict(employee_id,work_date) do update
      set clock_in_at = excluded.clock_in_at,
          clock_in_lat = excluded.clock_in_lat,
          clock_in_lng = excluded.clock_in_lng,
          status = 'present',
          updated_at = now()
      where public.attendance_records.clock_in_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Clock-in already recorded today'; end if;
  else
    update public.attendance_records
      set clock_out_at = now(), clock_out_lat = p_lat, clock_out_lng = p_lng, updated_at = now()
      where employee_id = v_uid and work_date = v_day
        and clock_in_at is not null and clock_out_at is null
      returning id into v_id;
    if v_id is null then raise exception 'Clock in first, or clock-out already recorded'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.gf_employee_punch(text,double precision,double precision) from public, anon;
grant execute on function public.gf_employee_punch(text,double precision,double precision) to authenticated;
revoke insert, update, delete on public.attendance_records from authenticated;
