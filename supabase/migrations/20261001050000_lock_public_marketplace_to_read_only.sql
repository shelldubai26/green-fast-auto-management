revoke insert, update, delete, truncate, references, trigger on public.public_vehicle_catalog from anon, authenticated;
grant select on public.public_vehicle_catalog to anon, authenticated;

revoke insert, update, delete, truncate, references, trigger on public.vehicle_catalog from anon;
revoke insert, update, delete, truncate, references, trigger on public.vehicle_catalog_variants from anon;
grant select on public.vehicle_catalog to anon;
grant select on public.vehicle_catalog_variants to anon;