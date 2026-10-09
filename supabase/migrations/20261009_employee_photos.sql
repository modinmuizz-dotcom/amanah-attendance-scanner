-- Optional private employee portrait photos
alter table public.employees
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-photos', 'employee-photos', false, 5242880, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;

create policy "amanah_employee_photos_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'employee-photos'
  and public.amanah_has_permission('master_data.employees')
);

create policy "amanah_employee_photos_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-photos'
  and public.amanah_has_permission('master_data.employees')
  and (storage.foldername(name))[1] = 'employees'
);

create policy "amanah_employee_photos_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-photos'
  and public.amanah_has_permission('master_data.employees')
);
