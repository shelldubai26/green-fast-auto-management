alter table public.live_leads add column if not exists director_action_id bigint references public.live_director_actions(id) on delete set null;
create index if not exists idx_live_leads_director_action_id on public.live_leads(director_action_id);

create or replace function public.assign_live_lead_director_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.director_action_id is null and new.session_id is not null then
    select a.id into new.director_action_id
    from public.live_director_actions a
    where a.session_id = new.session_id
      and a.executed_at is not null
      and a.executed_at <= coalesce(new.created_at, now())
      and a.executed_at >= coalesce(new.created_at, now()) - interval '10 minutes'
    order by a.executed_at desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_live_lead_director_action on public.live_leads;
create trigger trg_assign_live_lead_director_action
before insert on public.live_leads
for each row execute function public.assign_live_lead_director_action();

update public.live_leads l
set director_action_id = (
  select a.id
  from public.live_director_actions a
  where a.session_id = l.session_id
    and a.executed_at is not null
    and a.executed_at <= l.created_at
    and a.executed_at >= l.created_at - interval '10 minutes'
  order by a.executed_at desc
  limit 1
)
where l.director_action_id is null
  and exists (
    select 1 from public.live_director_actions a2
    where a2.session_id = l.session_id
      and a2.executed_at is not null
      and a2.executed_at <= l.created_at
      and a2.executed_at >= l.created_at - interval '10 minutes'
  );

create or replace view public.live_action_attribution
with (security_invoker = true)
as
select
  a.id as director_action_id,
  a.session_id,
  a.action_type,
  a.priority,
  a.executed_at,
  a.result_delta,
  count(l.id)::int as assisted_leads,
  count(l.id) filter (where l.first_contact_at is not null)::int as contacted_leads,
  count(l.id) filter (where l.appointment_at is not null)::int as appointments,
  count(l.id) filter (where l.visited_at is not null)::int as visits,
  count(l.id) filter (where l.test_drive_at is not null)::int as test_drives,
  count(l.id) filter (where l.deposit_at is not null)::int as deposits,
  count(l.id) filter (where l.won_at is not null or l.status='won')::int as sales,
  coalesce(sum(l.sale_price_xof),0)::numeric as attributed_revenue_xof
from public.live_director_actions a
left join public.live_leads l on l.director_action_id = a.id
group by a.id,a.session_id,a.action_type,a.priority,a.executed_at,a.result_delta;

grant select on public.live_action_attribution to authenticated;
