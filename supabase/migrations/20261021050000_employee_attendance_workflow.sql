alter table public.profiles add column if not exists job_title text not null default 'sales';
alter table public.profiles add column if not exists job_roles text[] not null default array['sales']::text[];

create table if not exists public.attendance_records (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.profiles(id) on delete cascade,
 work_date date not null default (now() at time zone 'Africa/Abidjan')::date,
 clock_in_at timestamptz, clock_out_at timestamptz,
 clock_in_lat double precision, clock_in_lng double precision,
 clock_out_lat double precision, clock_out_lng double precision,
 status text not null default 'present' check (status in ('present','late','absent','leave','incomplete','corrected')),
 correction_requested boolean not null default false,
 correction_reason text, correction_approved_by uuid references public.profiles(id),
 correction_approved_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(employee_id,work_date),
 check (clock_out_at is null or clock_in_at is not null)
);
create table if not exists public.leave_requests (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.profiles(id) on delete cascade,
 leave_type text not null check (leave_type in ('annual','sick','personal','unpaid','outing','overtime','clock_correction')),
 start_at timestamptz not null, end_at timestamptz not null, reason text not null,
 status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
 approver_id uuid references public.profiles(id), cc_user_ids uuid[] not null default '{}'::uuid[],
 decision_note text, decided_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), check (end_at >= start_at)
);
create table if not exists public.payroll_records (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.profiles(id) on delete cascade,
 pay_period date not null, base_salary numeric(14,2) not null default 0 check (base_salary >= 0),
 attendance_days numeric(6,2) not null default 0 check (attendance_days >= 0),
 absence_deduction numeric(14,2) not null default 0 check (absence_deduction >= 0),
 commission numeric(14,2) not null default 0 check (commission >= 0),
 bonus numeric(14,2) not null default 0 check (bonus >= 0),
 other_adjustment numeric(14,2) not null default 0, adjustment_note text,
 gross_pay numeric(14,2) not null default 0,
 status text not null default 'draft' check (status in ('draft','reviewed','approved','paid')),
 reviewed_by uuid references public.profiles(id), approved_by uuid references public.profiles(id), paid_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(employee_id,pay_period)
);
create table if not exists public.employee_workflow_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.leave_requests(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 action text not null check (action in ('submitted','approved','rejected','withdrawn','commented','cc_notified')),
 note text, created_at timestamptz not null default now()
);
create index if not exists attendance_employee_date_idx on public.attendance_records(employee_id,work_date desc);
create index if not exists leave_approver_status_idx on public.leave_requests(approver_id,status);
create index if not exists payroll_period_idx on public.payroll_records(pay_period desc);
create index if not exists workflow_request_idx on public.employee_workflow_events(request_id,created_at);

alter table public.attendance_records enable row level security;
alter table public.leave_requests enable row level security;
alter table public.payroll_records enable row level security;
alter table public.employee_workflow_events enable row level security;

create policy attendance_read_policy on public.attendance_records for select to authenticated using (
 employee_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','manager','finance'))
);
create policy attendance_insert_policy on public.attendance_records for insert to authenticated with check (employee_id=(select auth.uid()));
create policy attendance_update_policy on public.attendance_records for update to authenticated using (
 employee_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','manager'))
) with check (
 employee_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','manager'))
);
create policy leave_requests_read_policy on public.leave_requests for select to authenticated using (
 employee_id=(select auth.uid()) or approver_id=(select auth.uid()) or (select auth.uid())=any(cc_user_ids)
 or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','manager'))
);
create policy leave_requests_insert_policy on public.leave_requests for insert to authenticated with check (employee_id=(select auth.uid()) and status='pending');
create policy leave_requests_update_policy on public.leave_requests for update to authenticated using (
 (employee_id=(select auth.uid()) and status='pending') or approver_id=(select auth.uid())
 or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','manager'))
) with check (
 employee_id=(select auth.uid()) or approver_id=(select auth.uid())
 or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','manager'))
);
create policy payroll_read_policy on public.payroll_records for select to authenticated using (
 employee_id=(select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','finance'))
);
create policy payroll_admin_write_policy on public.payroll_records for all to authenticated using (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','finance'))
) with check (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','finance'))
);
create policy workflow_read_policy on public.employee_workflow_events for select to authenticated using (
 exists(select 1 from public.leave_requests lr where lr.id=request_id and (
 lr.employee_id=(select auth.uid()) or lr.approver_id=(select auth.uid()) or (select auth.uid())=any(lr.cc_user_ids)
 or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','manager'))))
);
create policy workflow_insert_policy on public.employee_workflow_events for insert to authenticated with check (
 actor_id=(select auth.uid()) and exists(select 1 from public.leave_requests lr where lr.id=request_id and (
 lr.employee_id=(select auth.uid()) or lr.approver_id=(select auth.uid())
 or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','manager'))))
);
grant select,insert,update on public.attendance_records to authenticated;
grant select,insert,update on public.leave_requests to authenticated;
grant select,insert,update,delete on public.payroll_records to authenticated;
grant select,insert on public.employee_workflow_events to authenticated;
