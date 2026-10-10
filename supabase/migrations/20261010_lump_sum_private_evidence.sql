-- Private evidence for AMANAH lump-sum contracts and progress billings.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('amanah-lump-evidence','amanah-lump-evidence',false,15728640,
 array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict(id) do update
set public=false,file_size_limit=15728640,
 allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf']::text[];

drop policy if exists "amanah_lump_evidence_upload" on storage.objects;
create policy "amanah_lump_evidence_upload" on storage.objects
for insert to authenticated
with check(
  bucket_id='amanah-lump-evidence'
  and auth.uid() is not null
  and (select public.amanah_lump_can('CREATE'))
);

drop policy if exists "amanah_lump_evidence_read" on storage.objects;
create policy "amanah_lump_evidence_read" on storage.objects
for select to authenticated
using(
  bucket_id='amanah-lump-evidence'
  and auth.uid() is not null
);
