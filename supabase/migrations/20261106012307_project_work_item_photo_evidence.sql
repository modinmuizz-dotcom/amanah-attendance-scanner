-- Evidence is separate from scope/baseline JSON. Existing scope commands stay unchanged.
create table public.project_work_item_photos (
  photo_id uuid primary key default gen_random_uuid(),
  project_id text not null references public.project_work_structures(project_id),
  group_id uuid not null,
  item_id uuid not null,
  object_path text not null unique,
  caption text not null default '' check (length(caption)<=250),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  is_ready boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  actor_label text not null,
  group_name text not null,
  item_name text not null
);
create index project_work_item_photos_item_idx on public.project_work_item_photos(project_id,group_id,item_id,created_at desc);
alter table public.project_work_item_photos enable row level security;
revoke all on public.project_work_item_photos from public,anon,authenticated;
grant select,insert,delete on public.project_work_item_photos to authenticated;
grant update(is_ready) on public.project_work_item_photos to authenticated;

create function amanah_private.work_photo_can_view() returns boolean
language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.view') or public.amanah_has_permission('schedule.manage'));
$$;
create function amanah_private.work_photo_can_manage() returns boolean
language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and (public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));
$$;
create function amanah_private.work_photo_item_exists(p_project_id text,p_group_id uuid,p_item_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.project_work_structures s
    cross join lateral jsonb_array_elements(s.groups) g
    cross join lateral jsonb_array_elements(g->'items') i
    where s.project_id=p_project_id and lower(g->>'id')=p_group_id::text and lower(i->>'id')=p_item_id::text);
$$;
revoke all on function amanah_private.work_photo_can_view(),amanah_private.work_photo_can_manage(),amanah_private.work_photo_item_exists(text,uuid,uuid) from public,anon;
grant usage on schema amanah_private to authenticated;
grant execute on function amanah_private.work_photo_can_view(),amanah_private.work_photo_can_manage(),amanah_private.work_photo_item_exists(text,uuid,uuid) to authenticated;

create policy work_item_photos_read on public.project_work_item_photos for select to authenticated using (
  (select amanah_private.work_photo_can_view()) and
  (is_ready or created_by=(select auth.uid()) or (select amanah_private.work_photo_can_manage()))
);
create policy work_item_photos_reserve on public.project_work_item_photos for insert to authenticated with check (
  (select amanah_private.work_photo_can_manage()) and created_by=(select auth.uid()) and not is_ready
  and amanah_private.work_photo_item_exists(project_id,group_id,item_id)
);
create policy work_item_photos_complete on public.project_work_item_photos for update to authenticated
using ((select amanah_private.work_photo_can_manage()) and created_by=(select auth.uid()))
with check ((select amanah_private.work_photo_can_manage()) and created_by=(select auth.uid()));
create policy work_item_photos_remove on public.project_work_item_photos for delete to authenticated
using ((select amanah_private.work_photo_can_manage()));

create function amanah_private.validate_work_photo() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_metadata jsonb;v_count integer;
begin
  if not amanah_private.work_photo_can_manage() then raise exception 'Engineer or project-management access is required.' using errcode='42501'; end if;
  if tg_op='DELETE' then
    if exists(select 1 from storage.objects where bucket_id='project-work-evidence' and name=old.object_path) then
      raise exception 'Remove the stored photo before removing its evidence record.' using errcode='22023';
    end if;
    return old;
  end if;
  if not amanah_private.work_photo_item_exists(new.project_id,new.group_id,new.item_id) then
    raise exception 'Save this work item in the project structure before attaching photos.' using errcode='22023';
  end if;
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('work-photos:'||new.project_id||':'||new.group_id||':'||new.item_id,0));
    select count(*) into v_count from public.project_work_item_photos where project_id=new.project_id and group_id=new.group_id and item_id=new.item_id;
    if v_count>=20 then raise exception 'Each work item can have up to 20 photos. Remove an unwanted or incomplete upload first.' using errcode='22023'; end if;
    new.created_by:=auth.uid();new.created_at:=now();new.is_ready:=false;
    new.actor_label:=coalesce(nullif(auth.jwt()->>'email',''),'Authorized engineer');
    new.caption:=trim(coalesce(new.caption,''));
    new.object_path:=auth.uid()::text||'/'||new.photo_id::text||case new.mime_type when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.invalid' end;
    select g->>'name',i->>'name' into new.group_name,new.item_name
      from public.project_work_structures s cross join lateral jsonb_array_elements(s.groups) g cross join lateral jsonb_array_elements(g->'items') i
      where s.project_id=new.project_id and lower(g->>'id')=new.group_id::text and lower(i->>'id')=new.item_id::text;
  else
    if (to_jsonb(new)-'is_ready') is distinct from (to_jsonb(old)-'is_ready') or (old.is_ready and not new.is_ready) then
      raise exception 'Evidence details are fixed after reservation.' using errcode='22023';
    end if;
    if new.is_ready then
      select metadata into v_metadata from storage.objects where bucket_id='project-work-evidence' and name=new.object_path;
      if v_metadata is null or (v_metadata->>'size')::bigint is distinct from new.byte_size::bigint or (v_metadata->>'mimetype') is distinct from new.mime_type then
        raise exception 'The stored photo is missing or does not match this upload. Please retry.' using errcode='22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function amanah_private.validate_work_photo() from public,anon;
grant execute on function amanah_private.validate_work_photo() to authenticated;
create trigger validate_work_item_photo before insert or update or delete on public.project_work_item_photos
for each row execute function amanah_private.validate_work_photo();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-work-evidence','project-work-evidence',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy work_photo_objects_read on storage.objects for select to authenticated using (
  bucket_id='project-work-evidence' and (select amanah_private.work_photo_can_view()) and
  exists(select 1 from public.project_work_item_photos p where p.object_path=objects.name)
);
create policy work_photo_objects_upload on storage.objects for insert to authenticated with check (
  bucket_id='project-work-evidence' and (select amanah_private.work_photo_can_manage()) and
  exists(select 1 from public.project_work_item_photos p where p.object_path=objects.name and p.created_by=(select auth.uid()) and not p.is_ready and amanah_private.work_photo_item_exists(p.project_id,p.group_id,p.item_id))
);
create policy work_photo_objects_remove on storage.objects for delete to authenticated using (
  bucket_id='project-work-evidence' and (select amanah_private.work_photo_can_manage()) and
  exists(select 1 from public.project_work_item_photos p where p.object_path=objects.name)
);
-- No UPDATE/upsert policy: existing evidence files cannot be silently overwritten.
create function public.amanah_project_work_photo_counts(p_project_id text)
returns table(group_id uuid,item_id uuid,photo_count bigint)
language sql stable security invoker set search_path='' as $$
  select p.group_id,p.item_id,count(*) from public.project_work_item_photos p
  where p.project_id=p_project_id and p.is_ready group by p.group_id,p.item_id;
$$;
revoke all on function public.amanah_project_work_photo_counts(text) from public,anon;
grant execute on function public.amanah_project_work_photo_counts(text) to authenticated;
notify pgrst,'reload schema';
