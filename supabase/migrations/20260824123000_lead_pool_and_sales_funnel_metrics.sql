alter table public.customers add column if not exists assigned_at timestamptz;
alter table public.customers add column if not exists first_contact_at timestamptz;
alter table public.customers add column if not exists visited_at timestamptz;
alter table public.customers add column if not exists deposit_at timestamptz;
alter table public.customers add column if not exists signed_at timestamptz;

create table if not exists public.customer_assignment_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  from_user_id uuid references public.profiles(id) on delete set null,
  to_user_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);

alter table public.customer_assignment_history enable row level security;
drop policy if exists assignment_history_management on public.customer_assignment_history;
create policy assignment_history_management on public.customer_assignment_history
for select to authenticated
using ((public.current_role() = any(array['owner'::app_role,'manager'::app_role])) or from_user_id=auth.uid() or to_user_id=auth.uid());

create or replace function public.gfauto_sync_customer_compat()
returns trigger language plpgsql set search_path='public' as $$
begin
  if tg_op='INSERT' then
    new.full_name:=coalesce(new.full_name,new.name); new.name:=coalesce(new.name,new.full_name);
    new.lead_source:=coalesce(new.lead_source,new.source); new.source:=coalesce(new.source,new.lead_source);
    new.assigned_to:=coalesce(new.assigned_to,new.assigned_sales); new.assigned_sales:=new.assigned_to;
    new.follow_up_date:=coalesce(new.follow_up_date,new.next_followup); new.next_followup:=new.follow_up_date;
  else
    if new.full_name is distinct from old.full_name then new.name:=new.full_name; elsif new.name is distinct from old.name then new.full_name:=new.name; end if;
    if new.lead_source is distinct from old.lead_source then new.source:=new.lead_source; elsif new.source is distinct from old.source then new.lead_source:=new.source; end if;
    if new.assigned_to is distinct from old.assigned_to then new.assigned_sales:=new.assigned_to; elsif new.assigned_sales is distinct from old.assigned_sales then new.assigned_to:=new.assigned_sales; end if;
    if new.follow_up_date is distinct from old.follow_up_date then new.next_followup:=new.follow_up_date; elsif new.next_followup is distinct from old.next_followup then new.follow_up_date:=new.next_followup; end if;
  end if;
  return new;
end $$;

create or replace function public.prepare_customer_assignment()
returns trigger language plpgsql set search_path='public' as $$
begin
  if tg_op='INSERT' then
    if new.assigned_to is not null and new.assigned_at is null then new.assigned_at:=now(); end if;
  elsif new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is null then new.assigned_at:=null; new.first_contact_at:=null;
    else new.assigned_at:=now(); new.first_contact_at:=null; end if;
  end if;
  if new.assigned_to is not null and new.first_contact_at is null and new.stage is not null and new.stage <> 'new' then
    if tg_op='INSERT' or old.stage is distinct from new.stage then new.first_contact_at:=now(); end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_prepare_customer_assignment on public.customers;
create trigger trg_prepare_customer_assignment before insert or update on public.customers for each row execute function public.prepare_customer_assignment();

create or replace function public.track_customer_assignment()
returns trigger language plpgsql security definer set search_path='public' as $$
begin
  if tg_op='UPDATE' and new.assigned_to is distinct from old.assigned_to then
    insert into public.customer_assignment_history(customer_id,from_user_id,to_user_id,assigned_by) values(new.id,old.assigned_to,new.assigned_to,new.assigned_by);
  elsif tg_op='INSERT' and new.assigned_to is not null then
    insert into public.customer_assignment_history(customer_id,from_user_id,to_user_id,assigned_by) values(new.id,null,new.assigned_to,new.assigned_by);
  end if;
  return new;
end $$;

drop trigger if exists trg_track_customer_assignment on public.customers;
create trigger trg_track_customer_assignment after insert or update of assigned_to on public.customers for each row execute function public.track_customer_assignment();

update public.customers set assigned_at=coalesce(assigned_at,created_at) where assigned_to is not null and assigned_at is null;
