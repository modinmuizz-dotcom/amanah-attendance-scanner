-- Read-only deployment/security assertions. No business records or Storage objects are created.
begin;
do $$
declare bucket record;bad integer;
begin
  select * into bucket from storage.buckets where id='project-work-evidence';
  if not found or bucket.public or bucket.file_size_limit<>5242880 or bucket.allowed_mime_types<>array['image/jpeg','image/png','image/webp'] then raise exception 'Evidence bucket restrictions are incorrect.';end if;
  if not (select relrowsecurity from pg_class where oid='public.project_work_item_photos'::regclass) then raise exception 'Evidence RLS must be enabled.';end if;
  if has_table_privilege('anon','public.project_work_item_photos','SELECT') or has_table_privilege('anon','public.project_work_item_photos','INSERT') then raise exception 'Anonymous evidence access is too broad.';end if;
  if not has_column_privilege('authenticated','public.project_work_item_photos','is_ready','UPDATE') or has_column_privilege('authenticated','public.project_work_item_photos','object_path','UPDATE') or has_column_privilege('authenticated','public.project_work_item_photos','project_id','UPDATE') then raise exception 'Evidence update grants are incorrect.';end if;
  if has_function_privilege('anon','public.amanah_project_work_photo_counts(text)','EXECUTE') or not has_function_privilege('authenticated','public.amanah_project_work_photo_counts(text)','EXECUTE') then raise exception 'Evidence count RPC grants are incorrect.';end if;
  select count(*) into bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ((n.nspname='amanah_private' and p.proname in ('work_photo_can_view','work_photo_can_manage','work_photo_item_exists','validate_work_photo')) or (n.nspname='public' and p.proname='amanah_project_work_photo_counts')) and p.prosecdef;
  if bad<>0 then raise exception 'New evidence functions must be security invoker.';end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='project_work_item_photos')<>4 then raise exception 'Evidence policies are incomplete.';end if;
  if (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('work_photo_objects_read','work_photo_objects_upload','work_photo_objects_remove'))<>3 then raise exception 'Storage policies are incomplete.';end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.project_work_item_photos'::regclass and tgname='validate_work_item_photo' and tgenabled='O') then raise exception 'Evidence validation trigger is disabled.';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  if amanah_private.work_photo_can_view() or amanah_private.work_photo_can_manage() then raise exception 'Missing user identity was authorized.';end if;
  if exists(select 1 from public.project_work_item_photos) then raise exception 'Evidence was visible without an assigned identity.';end if;
  if exists(select 1 from public.amanah_project_work_photo_counts('__no_project__')) then raise exception 'Counts exposed evidence without an identity.';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',gen_random_uuid())::text,true);
  if amanah_private.work_photo_can_view() or amanah_private.work_photo_can_manage() then raise exception 'An unassigned user was authorized.';end if;
end $$;
reset role;
rollback;
