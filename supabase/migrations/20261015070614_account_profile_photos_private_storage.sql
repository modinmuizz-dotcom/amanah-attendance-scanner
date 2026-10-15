-- Personal account pictures are separate from employee master-data photos.
-- Only the authenticated owner can upload, sign/read, or delete their images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-avatars', 'account-avatars', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists amanah_account_avatars_read_own on storage.objects;
create policy amanah_account_avatars_read_own
on storage.objects for select to authenticated
using (
  bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists amanah_account_avatars_insert_own on storage.objects;
create policy amanah_account_avatars_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists amanah_account_avatars_delete_own on storage.objects;
create policy amanah_account_avatars_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Replacements use a fresh object name (no upsert/UPDATE policy). Auth metadata
-- stores only the private object path; short-lived signed URLs stay in memory.
