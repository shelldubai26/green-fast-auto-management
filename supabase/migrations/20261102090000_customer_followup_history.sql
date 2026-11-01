create table if not exists public.customer_followups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  content text not null,
  content_zh text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_followups_customer_created_idx
  on public.customer_followups(customer_id, created_at desc);

alter table public.customer_followups enable row level security;

drop policy if exists customer_followups_select on public.customer_followups;
create policy customer_followups_select
on public.customer_followups for select to authenticated
using (
  exists (
    select 1 from public.customers c
    where c.id = customer_id
      and (
        (select private.gf_has_any_app_role(ARRAY['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role]))
        or c.assigned_to = (select auth.uid())
      )
  )
);

drop policy if exists customer_followups_insert on public.customer_followups;
create policy customer_followups_insert
on public.customer_followups for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.customers c
    where c.id = customer_id
      and (
        (select private.gf_has_any_app_role(ARRAY['owner'::public.app_role,'manager'::public.app_role]))
        or c.assigned_to = (select auth.uid())
      )
  )
);

grant select, insert on public.customer_followups to authenticated;

-- Preserve existing customer notes as the first historical follow-up.
insert into public.customer_followups(customer_id, content, content_zh, created_at)
select id, notes, notes_zh, coalesce(updated_at, created_at, now())
from public.customers
where nullif(trim(notes), '') is not null
  and not exists (
    select 1 from public.customer_followups f where f.customer_id = customers.id
  );

notify pgrst, 'reload schema';
