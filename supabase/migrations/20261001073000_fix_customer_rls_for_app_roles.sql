-- Keep customer CRM access aligned with the application role stored in public.profiles.
-- Production was already updated with this policy set; this migration records the change
-- for reproducible environments.

alter table public.customers enable row level security;

drop policy if exists customers_read on public.customers;
drop policy if exists customers_write on public.customers;

create policy customers_select_authenticated
on public.customers
for select
to authenticated
using (
  (select private.gf_has_any_app_role(ARRAY['owner'::public.app_role,'manager'::public.app_role,'finance'::public.app_role]))
  or assigned_to = (select auth.uid())
);

create policy customers_insert_authenticated
on public.customers
for insert
to authenticated
with check (
  (select private.gf_has_any_app_role(ARRAY['owner'::public.app_role,'manager'::public.app_role]))
  or assigned_to = (select auth.uid())
);

create policy customers_update_authenticated
on public.customers
for update
to authenticated
using (
  (select private.gf_has_any_app_role(ARRAY['owner'::public.app_role,'manager'::public.app_role]))
  or assigned_to = (select auth.uid())
)
with check (
  (select private.gf_has_any_app_role(ARRAY['owner'::public.app_role,'manager'::public.app_role]))
  or assigned_to = (select auth.uid())
);

create policy customers_delete_authenticated
on public.customers
for delete
to authenticated
using (
  (select private.gf_has_any_app_role(ARRAY['owner'::public.app_role,'manager'::public.app_role]))
);

revoke all on table public.customers from anon;
grant select, insert, update, delete on table public.customers to authenticated;

notify pgrst, 'reload schema';
