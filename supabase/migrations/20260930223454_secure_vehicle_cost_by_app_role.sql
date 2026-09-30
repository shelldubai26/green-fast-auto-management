begin;

create schema if not exists private;

create or replace function private.gf_has_any_app_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.active = true
      and p.role = any(p_roles)
  );
$$;

revoke all on function private.gf_has_any_app_role(public.app_role[]) from public, anon;
grant execute on function private.gf_has_any_app_role(public.app_role[]) to authenticated;

drop view if exists public.owner_vehicle_catalog;
create view public.owner_vehicle_catalog as
select v.*
from public.vehicles v
where (select private.gf_has_any_app_role(array['owner','finance']::public.app_role[]));

create or replace view public.manager_vehicle_catalog as
select
  v.id, v.stock_number, v.make, v.model, v.trim, v.year, v.vin,
  v.exterior_color, v.interior_color, v.mileage, v.fuel_type,
  v.shipping_date, v.eta_abidjan, v.arrival_date, v.status,
  v.asking_price, v.final_sale_price, v.photos, v.documents,
  v.created_at, v.updated_at,
  v.stock_no, v.brand, v.version_year, v.color, v.energy,
  v.assigned_sales, v.purchased_at, v.shipped_at, v.arrived_at, v.stocked_at,
  v.list_price_xof, v.target_price_xof, v.sales_floor_xof,
  v.body_type, v.engine, v.displacement, v.horsepower, v.transmission,
  v.drivetrain, v.seats, v.feature_summary, v.public_photos,
  v.hidden_photo_urls, v.marketing_cover_url, v.vehicle_specs,
  v.configuration_image_url, v.vehicle_condition,
  v.supplier, v.china_purchase_ref, v.purchase_date
from public.vehicles v
where (select private.gf_has_any_app_role(array['manager']::public.app_role[]));

create or replace view public.sales_vehicle_catalog as
select
  v.id, v.stock_number, v.make, v.model, v.trim, v.year, v.vin,
  v.exterior_color, v.interior_color, v.mileage, v.fuel_type,
  v.supplier, v.china_purchase_ref, v.purchase_date, v.shipping_date,
  v.eta_abidjan, v.arrival_date, v.status::text as status,
  coalesce(v.asking_price, v.list_price_xof) as asking_price,
  v.final_sale_price, v.photos, v.documents, v.created_at, v.updated_at,
  v.vehicle_specs, v.marketing_cover_url, v.vehicle_condition
from public.vehicles v
where (select private.gf_has_any_app_role(array['sales']::public.app_role[]));

create or replace view public.delivery_vehicle_catalog as
select
  v.id, v.stock_number, v.make, v.model, v.trim, v.year, v.vin,
  v.exterior_color, v.interior_color, v.mileage, v.fuel_type,
  v.shipping_date, v.eta_abidjan, v.arrival_date, v.status,
  v.asking_price, v.final_sale_price, v.photos, v.documents,
  v.created_at, v.updated_at,
  v.stock_no, v.brand, v.version_year, v.color, v.energy,
  v.assigned_sales, v.purchased_at, v.shipped_at, v.arrived_at, v.stocked_at,
  v.list_price_xof, v.target_price_xof, v.sales_floor_xof,
  v.body_type, v.engine, v.displacement, v.horsepower, v.transmission,
  v.drivetrain, v.seats, v.feature_summary, v.public_photos,
  v.hidden_photo_urls, v.marketing_cover_url, v.vehicle_specs,
  v.configuration_image_url, v.vehicle_condition
from public.vehicles v
where (select private.gf_has_any_app_role(array['delivery']::public.app_role[]));

revoke all on table public.vehicles from anon, authenticated;

grant select, insert, update, delete on public.owner_vehicle_catalog to authenticated;
grant select, insert, update, delete on public.manager_vehicle_catalog to authenticated;
grant select on public.sales_vehicle_catalog to authenticated;
grant select, insert, update, delete on public.delivery_vehicle_catalog to authenticated;

revoke all on public.manager_vehicle_catalog from anon;
revoke all on public.sales_vehicle_catalog from anon;
revoke all on public.owner_vehicle_catalog from anon;
revoke all on public.delivery_vehicle_catalog from anon;

commit;