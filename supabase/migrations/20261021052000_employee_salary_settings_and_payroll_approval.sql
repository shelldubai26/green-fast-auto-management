create table if not exists public.employee_salary_settings (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.profiles(id) on delete restrict,
 base_salary numeric(14,2) not null check (base_salary >= 0),
 commission_rate numeric(7,4) not null default 0 check (commission_rate >= 0 and commission_rate <= 100),
 fixed_bonus numeric(14,2) not null default 0 check (fixed_bonus >= 0),
 effective_from date not null,
 notes text,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(employee_id,effective_from)
);
create index if not exists employee_salary_effective_idx on public.employee_salary_settings(employee_id,effective_from desc);
alter table public.employee_salary_settings enable row level security;
drop policy if exists salary_settings_read_policy on public.employee_salary_settings;
create policy salary_settings_read_policy on public.employee_salary_settings for select to authenticated using (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','finance'))
);
drop policy if exists salary_settings_owner_insert_policy on public.employee_salary_settings;
create policy salary_settings_owner_insert_policy on public.employee_salary_settings for insert to authenticated with check (
 created_by=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='owner')
);
revoke all on public.employee_salary_settings from anon, public;
grant select,insert on public.employee_salary_settings to authenticated;
revoke update,delete on public.employee_salary_settings from authenticated;

create or replace function public.gf_guard_payroll_status_transition()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_role text;
begin
 select p.role into v_role from public.profiles p where p.id=auth.uid();
 if auth.uid() is null or v_role is null then raise exception 'Authentication required'; end if;
 if tg_op='INSERT' then
   if v_role not in ('owner','finance') or new.status <> 'draft' then raise exception 'Only Owner or Finance may create draft payroll'; end if;
   return new;
 end if;
 if tg_op='UPDATE' and new.status is distinct from old.status then
   if old.status='draft' and new.status='reviewed' and v_role='owner' then
     new.reviewed_by := auth.uid();
   elsif old.status='reviewed' and new.status='approved' and v_role='owner' then
     new.approved_by := auth.uid();
   elsif old.status='approved' and new.status='paid' and v_role in ('owner','finance') then
     new.paid_at := coalesce(new.paid_at,now());
   else
     raise exception 'Payroll status transition not permitted for role %: % -> %',v_role,old.status,new.status;
   end if;
 end if;
 if old.status in ('approved','paid') and (
   new.employee_id is distinct from old.employee_id or new.pay_period is distinct from old.pay_period or
   new.base_salary is distinct from old.base_salary or new.attendance_days is distinct from old.attendance_days or
   new.absence_deduction is distinct from old.absence_deduction or new.commission is distinct from old.commission or
   new.bonus is distinct from old.bonus or new.other_adjustment is distinct from old.other_adjustment or new.gross_pay is distinct from old.gross_pay
 ) then raise exception 'Approved payroll amounts are locked'; end if;
 return new;
end;
$$;
revoke all on function public.gf_guard_payroll_status_transition() from public, anon, authenticated;
drop trigger if exists gf_guard_payroll_status_transition on public.payroll_records;
create trigger gf_guard_payroll_status_transition before insert or update on public.payroll_records
for each row execute function public.gf_guard_payroll_status_transition();
