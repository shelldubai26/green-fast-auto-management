-- LIVE SALES AI V0.3 — CRM / sales outcome feedback
alter table public.live_leads
  add column if not exists first_contact_at timestamptz,
  add column if not exists appointment_at timestamptz,
  add column if not exists visited_at timestamptz,
  add column if not exists test_drive_at timestamptz,
  add column if not exists deposit_at timestamptz,
  add column if not exists won_at timestamptz,
  add column if not exists lost_at timestamptz,
  add column if not exists sale_id uuid references public.sales(id) on delete set null,
  add column if not exists sale_price_xof numeric default 0;

alter table public.live_leads drop constraint if exists live_leads_status_check;
alter table public.live_leads add constraint live_leads_status_check
  check (status = any (array['new','contacted','qualified','appointment','visited','test_drive','deposit','won','lost']::text[]));

create or replace function public.gf_refresh_live_session_outcomes(p_session_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.live_sessions s set
    leads=x.leads, appointments=x.appointments, visits=x.visits,
    test_drives=x.test_drives, sales=x.sales, revenue=x.revenue
  from (
    select count(*)::int leads,
      count(*) filter(where appointment_at is not null or status in('appointment','visited','test_drive','deposit','won'))::int appointments,
      count(*) filter(where visited_at is not null or status in('visited','test_drive','deposit','won'))::int visits,
      count(*) filter(where test_drive_at is not null or status in('test_drive','deposit','won'))::int test_drives,
      count(*) filter(where won_at is not null or status='won')::int sales,
      coalesce(sum(case when won_at is not null or status='won' then sale_price_xof else 0 end),0) revenue
    from public.live_leads where session_id=p_session_id
  ) x where s.id=p_session_id;
end;$$;

create or replace function public.gf_sync_live_lead_from_customer()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_status text; v_session uuid;
begin
  v_status:=case
    when new.signed_at is not null or new.stage='won' then 'won'
    when new.deposit_at is not null or new.stage='deposit' then 'deposit'
    when new.stage='test_drive' then 'test_drive'
    when new.visited_at is not null or new.stage='visited' then 'visited'
    when new.stage='appointment' then 'appointment'
    when new.stage='qualified' then 'qualified'
    when new.first_contact_at is not null or new.stage='contacted' then 'contacted'
    when new.stage='lost' then 'lost' else null end;
  update public.live_leads set
    first_contact_at=coalesce(first_contact_at,new.first_contact_at),
    appointment_at=case when new.stage='appointment' then coalesce(appointment_at,now()) else appointment_at end,
    visited_at=coalesce(visited_at,new.visited_at),
    test_drive_at=case when new.stage='test_drive' then coalesce(test_drive_at,now()) else test_drive_at end,
    deposit_at=coalesce(deposit_at,new.deposit_at), won_at=coalesce(won_at,new.signed_at),
    lost_at=case when new.stage='lost' then coalesce(lost_at,now()) else lost_at end,
    status=coalesce(v_status,status),updated_at=now() where customer_id=new.id;
  for v_session in select distinct session_id from public.live_leads where customer_id=new.id and session_id is not null loop
    perform public.gf_refresh_live_session_outcomes(v_session);
  end loop; return new;
end;$$;

drop trigger if exists trg_gf_sync_live_lead_from_customer on public.customers;
create trigger trg_gf_sync_live_lead_from_customer after update of first_contact_at,visited_at,deposit_at,signed_at,stage on public.customers for each row execute function public.gf_sync_live_lead_from_customer();

create or replace function public.gf_sync_live_lead_from_sale()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_session uuid;
begin
  update public.live_leads set sale_id=new.id,sale_price_xof=new.sale_price_xof,won_at=coalesce(won_at,new.sold_at,now()),status='won',updated_at=now() where customer_id=new.customer_id;
  for v_session in select distinct session_id from public.live_leads where customer_id=new.customer_id and session_id is not null loop perform public.gf_refresh_live_session_outcomes(v_session); end loop;
  return new;
end;$$;

drop trigger if exists trg_gf_sync_live_lead_from_sale on public.sales;
create trigger trg_gf_sync_live_lead_from_sale after insert or update of sale_price_xof,sold_at on public.sales for each row execute function public.gf_sync_live_lead_from_sale();

create or replace function public.gf_refresh_live_session_after_lead_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then if old.session_id is not null then perform public.gf_refresh_live_session_outcomes(old.session_id); end if; return old; end if;
  if new.session_id is not null then perform public.gf_refresh_live_session_outcomes(new.session_id); end if;
  if tg_op='UPDATE' and old.session_id is distinct from new.session_id and old.session_id is not null then perform public.gf_refresh_live_session_outcomes(old.session_id); end if;
  return new;
end;$$;

drop trigger if exists trg_gf_refresh_live_session_after_lead_change on public.live_leads;
create trigger trg_gf_refresh_live_session_after_lead_change after insert or update or delete on public.live_leads for each row execute function public.gf_refresh_live_session_after_lead_change();
