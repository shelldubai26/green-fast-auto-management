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