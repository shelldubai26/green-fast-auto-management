insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-media','vehicle-media',true,10485760,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public=true, file_size_limit=10485760, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "vehicle media upload" on storage.objects;
create policy "vehicle media upload" on storage.objects for insert to authenticated with check (bucket_id='vehicle-media');

drop policy if exists "vehicle media update" on storage.objects;
create policy "vehicle media update" on storage.objects for update to authenticated using (bucket_id='vehicle-media') with check (bucket_id='vehicle-media');

drop policy if exists "vehicle media delete" on storage.objects;
create policy "vehicle media delete" on storage.objects for delete to authenticated using (bucket_id='vehicle-media');

drop policy if exists "vehicle media list" on storage.objects;
create policy "vehicle media list" on storage.objects for select to authenticated using (bucket_id='vehicle-media');
