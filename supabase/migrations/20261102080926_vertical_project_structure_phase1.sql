-- AMANAH: non-road project scope, weights and versioned baselines.
-- Read policies follow the existing company-wide project/schedule permissions.
-- Mutations use a private, permission-checked command to atomically save the
-- baseline and its audit event; clients cannot write either table directly.
create schema if not exists amanah_private;
revoke all on schema amanah_private from public, anon;
grant usage on schema amanah_private to authenticated;

create table public.project_work_structures (
  project_id text primary key references public.projects(project_id) on delete cascade,
  project_type text not null check (project_type in ('SCHOOL BUILDING','MULTI PURPOSE BUILDING','COVERED COURT','WATER SYSTEM')),
  groups jsonb not null default '[]'::jsonb check (jsonb_typeof(groups)='array'),
  status text not null default 'DRAFT' check (status in ('DRAFT','BASELINED')),
  revision bigint not null default 1 check (revision>0),
  baseline_version integer not null default 1 check (baseline_version>0),
  baselined_at timestamptz,
  baselined_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='DRAFT' and baselined_at is null) or (status='BASELINED' and baselined_at is not null))
);
create index project_work_structures_created_by_idx on public.project_work_structures(created_by);
create index project_work_structures_updated_by_idx on public.project_work_structures(updated_by);
create index project_work_structures_baselined_by_idx on public.project_work_structures(baselined_by);

create table public.project_work_structure_events (
  event_id bigint generated always as identity primary key,
  project_id text not null references public.project_work_structures(project_id) on delete cascade,
  event_type text not null check (event_type in ('DRAFT_SAVED','BASELINE_SET','BASELINE_REOPENED')),
  baseline_version integer not null,
  revision bigint not null,
  reason text not null default '',
  details jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  actor_label text not null default '',
  occurred_at timestamptz not null default now()
);
create index project_work_structure_events_project_idx on public.project_work_structure_events(project_id,event_id desc);
create index project_work_structure_events_actor_idx on public.project_work_structure_events(actor_id);

alter table public.project_work_structures enable row level security;
alter table public.project_work_structure_events enable row level security;
revoke all on public.project_work_structures, public.project_work_structure_events from public,anon,authenticated;
grant select on public.project_work_structures, public.project_work_structure_events to authenticated;
create policy project_work_structures_read on public.project_work_structures for select to authenticated using (
  (select auth.uid()) is not null and (
    (select public.amanah_has_permission('master_data.projects')) or
    (select public.amanah_has_permission('schedule.view')) or
    (select public.amanah_has_permission('schedule.manage'))
  )
);
create policy project_work_structure_events_read on public.project_work_structure_events for select to authenticated using (
  (select auth.uid()) is not null and (
    (select public.amanah_has_permission('master_data.projects')) or
    (select public.amanah_has_permission('schedule.view')) or
    (select public.amanah_has_permission('schedule.manage'))
  )
);

create function amanah_private.require_structure_access(p_write boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_manage boolean;
begin
  if v_user is null then raise exception 'Please sign in to open Project Structure.' using errcode='42501'; end if;
  v_manage:=public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage');
  if not v_manage and (p_write or not public.amanah_has_permission('schedule.view')) then
    raise exception 'Your role does not permit this Project Structure action.' using errcode='42501';
  end if;
  return v_user;
end $$;
revoke all on function amanah_private.require_structure_access(boolean) from public,anon;
grant execute on function amanah_private.require_structure_access(boolean) to authenticated;

create function amanah_private.validate_work_groups(p_groups jsonb,p_final boolean)
returns numeric language plpgsql immutable security invoker set search_path='' as $$
declare g jsonb; i jsonb; v_ids text[]:='{}'; v_id text; v_total numeric:=0;
  v_weight numeric; v_count integer:=0; v_start date; v_end date;
begin
  if p_groups is null or jsonb_typeof(p_groups)<>'array' or jsonb_array_length(p_groups)>20 then
    raise exception 'Provide up to 20 work groups.' using errcode='22023';
  end if;
  if p_final and jsonb_array_length(p_groups)=0 then raise exception 'Add at least one work group.' using errcode='22023'; end if;
  for g in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(g)<>'object' or exists(select 1 from jsonb_object_keys(g) k(key) where key not in ('id','name','items')) then
      raise exception 'Invalid work group fields.' using errcode='22023';
    end if;
    if jsonb_typeof(g->'id') is distinct from 'string' or jsonb_typeof(g->'name') is distinct from 'string'
      or length(btrim(g->>'name')) not between 1 and 100 then
      raise exception 'Each group needs a name of 1 to 100 characters and a valid ID.' using errcode='22023';
    end if;
    v_id:=(g->>'id')::uuid::text;
    if v_id<>g->>'id' or v_id=any(v_ids) then raise exception 'Work group IDs must be unique.' using errcode='22023'; end if;
    v_ids:=array_append(v_ids,v_id);
    if jsonb_typeof(g->'items') is distinct from 'array' then raise exception 'Invalid work item list.' using errcode='22023'; end if;
    if p_final and jsonb_array_length(g->'items')=0 then raise exception 'Every baseline group must contain work items.' using errcode='22023'; end if;
    for i in select value from jsonb_array_elements(g->'items') loop
      v_count:=v_count+1;
      if v_count>400 then raise exception 'A structure can contain up to 400 work items.' using errcode='22023'; end if;
      if jsonb_typeof(i)<>'object' or exists(select 1 from jsonb_object_keys(i) k(key) where key not in ('id','name','location','weight','planned_start','planned_end')) then
        raise exception 'Invalid work item fields.' using errcode='22023';
      end if;
      if jsonb_typeof(i->'id') is distinct from 'string' or jsonb_typeof(i->'name') is distinct from 'string'
        or length(btrim(i->>'name')) not between 1 and 200 then
        raise exception 'Each work item needs a name of 1 to 200 characters and a valid ID.' using errcode='22023';
      end if;
      v_id:=(i->>'id')::uuid::text;
      if v_id<>i->>'id' or v_id=any(v_ids) then raise exception 'Work item IDs must be unique.' using errcode='22023'; end if;
      v_ids:=array_append(v_ids,v_id);
      if i ? 'location' and (jsonb_typeof(i->'location') is distinct from 'string' or length(i->>'location')>160) then
        raise exception 'A work location can contain up to 160 characters.' using errcode='22023';
      end if;
      if jsonb_typeof(i->'weight') is distinct from 'number' then raise exception 'Every work item needs a numeric weight.' using errcode='22023'; end if;
      v_weight:=(i->>'weight')::numeric;
      if v_weight<0 or v_weight>100 or v_weight<>round(v_weight,2) or (p_final and v_weight=0) then
        raise exception 'Weights must be between 0 and 100 with at most two decimal places. Baseline items must have positive weights.' using errcode='22023';
      end if;
      v_total:=v_total+v_weight;
      v_start:=null;v_end:=null;
      if i->>'planned_start' is not null then
        if (i->>'planned_start') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use a valid planned start date.' using errcode='22023'; end if;
        v_start:=(i->>'planned_start')::date;
      end if;
      if i->>'planned_end' is not null then
        if (i->>'planned_end') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use a valid planned finish date.' using errcode='22023'; end if;
        v_end:=(i->>'planned_end')::date;
      end if;
      if v_start is not null and v_end is not null and v_end<v_start then raise exception 'Planned finish cannot be before planned start.' using errcode='22023'; end if;
    end loop;
  end loop;
  if v_total>100 or (p_final and v_total<>100) then raise exception 'Work item weights must total exactly 100%% to set the baseline; drafts may total less.' using errcode='22023'; end if;
  return v_total;
end $$;
revoke all on function amanah_private.validate_work_groups(jsonb,boolean) from public,anon,authenticated;

create function amanah_private.apply_structure_command(p_project_id text,p_action text,p_groups jsonb,p_expected_revision bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid;v_type text;v_row public.project_work_structures%rowtype;
  v_exists boolean;v_total numeric;v_event text;v_details jsonb:='{}'::jsonb;
begin
  v_actor:=amanah_private.require_structure_access(true);
  if p_action is null or p_action not in ('SAVE','BASELINE','REOPEN') then raise exception 'Unknown structure action.' using errcode='22023'; end if;
  if p_expected_revision is null or p_expected_revision<0 then raise exception 'Reload the saved structure before continuing.' using errcode='40001'; end if;
  -- Lock the parent even for the first save, serializing concurrent creation.
  select project_type into v_type from public.projects where project_id=p_project_id for update;
  if not found then raise exception 'Project not found.' using errcode='23503'; end if;
  if v_type is null or v_type not in ('SCHOOL BUILDING','MULTI PURPOSE BUILDING','COVERED COURT','WATER SYSTEM') then
    raise exception 'This project type uses a different structure workflow.' using errcode='22023';
  end if;
  select * into v_row from public.project_work_structures where project_id=p_project_id for update;
  v_exists:=found;
  if (v_exists and v_row.revision<>p_expected_revision) or (not v_exists and p_expected_revision<>0) then
    raise exception 'Another user changed this structure. Reload it before saving.' using errcode='40001';
  end if;
  if p_action='SAVE' then
    if v_exists and v_row.status<>'DRAFT' then raise exception 'Reopen the baseline before changing its scope or weights.' using errcode='22023'; end if;
    v_total:=amanah_private.validate_work_groups(p_groups,false);
    if v_exists then
      update public.project_work_structures set groups=p_groups,project_type=v_type,revision=revision+1,updated_by=v_actor,updated_at=now()
        where project_id=p_project_id returning * into v_row;
    else
      insert into public.project_work_structures(project_id,project_type,groups,created_by,updated_by)
        values(p_project_id,v_type,p_groups,v_actor,v_actor) returning * into v_row;
    end if;
    v_event:='DRAFT_SAVED';v_details:=jsonb_build_object('weight_total',v_total);
  elsif p_action='BASELINE' then
    if not v_exists or v_row.status<>'DRAFT' then raise exception 'Save a draft before setting its baseline.' using errcode='22023'; end if;
    if v_row.project_type<>v_type then raise exception 'The project type has changed. Review and save the draft first.' using errcode='22023'; end if;
    v_total:=amanah_private.validate_work_groups(v_row.groups,true);
    update public.project_work_structures set status='BASELINED',baselined_at=now(),baselined_by=v_actor,revision=revision+1,updated_by=v_actor,updated_at=now()
      where project_id=p_project_id returning * into v_row;
    v_event:='BASELINE_SET';v_details:=jsonb_build_object('groups',v_row.groups,'weight_total',v_total);
  else
    if not v_exists or v_row.status<>'BASELINED' then raise exception 'Only a saved baseline can be reopened.' using errcode='22023'; end if;
    if length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Enter a revision reason of 10 to 1000 characters.' using errcode='22023'; end if;
    v_details:=jsonb_build_object('previous_baseline_version',v_row.baseline_version,'groups',v_row.groups);
    update public.project_work_structures set status='DRAFT',baseline_version=baseline_version+1,baselined_at=null,baselined_by=null,revision=revision+1,updated_by=v_actor,updated_at=now()
      where project_id=p_project_id returning * into v_row;
    v_event:='BASELINE_REOPENED';
  end if;
  insert into public.project_work_structure_events(project_id,event_type,baseline_version,revision,reason,details,actor_id,actor_label)
    values(p_project_id,v_event,v_row.baseline_version,v_row.revision,
      case when p_action='REOPEN' then btrim(p_reason) else '' end,v_details,v_actor,coalesce(auth.jwt()->>'email','Authorized team member'));
  return to_jsonb(v_row);
end $$;
revoke all on function amanah_private.apply_structure_command(text,text,jsonb,bigint,text) from public,anon;
grant execute on function amanah_private.apply_structure_command(text,text,jsonb,bigint,text) to authenticated;

create function public.amanah_project_structure_write(p_project_id text,p_action text,p_groups jsonb default null,p_expected_revision bigint default 0,p_reason text default '')
returns jsonb language sql security invoker set search_path='' as $$
  select amanah_private.apply_structure_command(p_project_id,p_action,p_groups,p_expected_revision,p_reason);
$$;
revoke all on function public.amanah_project_structure_write(text,text,jsonb,bigint,text) from public,anon;
grant execute on function public.amanah_project_structure_write(text,text,jsonb,bigint,text) to authenticated;

create function public.amanah_project_structure_get(p_project_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_project record;v_structure jsonb;v_events jsonb;
begin
  perform amanah_private.require_structure_access(false);
  select project_id,project_name,project_type,location,status into v_project from public.projects where project_id=p_project_id;
  if not found then raise exception 'Project not found.' using errcode='23503'; end if;
  if v_project.project_type is null or v_project.project_type not in ('SCHOOL BUILDING','MULTI PURPOSE BUILDING','COVERED COURT','WATER SYSTEM') then
    raise exception 'Select a school building, multi-purpose building, covered court or water system.' using errcode='22023';
  end if;
  select to_jsonb(s) into v_structure from public.project_work_structures s where s.project_id=p_project_id;
  select coalesce(jsonb_agg(e order by e.event_id desc),'[]'::jsonb) into v_events from (
    select event_id,event_type,baseline_version,revision,reason,actor_label,occurred_at
    from public.project_work_structure_events where project_id=p_project_id order by event_id desc limit 20
  ) e;
  return jsonb_build_object('project',to_jsonb(v_project),'structure',v_structure,'events',v_events,
    'can_manage',public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));
end $$;
revoke all on function public.amanah_project_structure_get(text) from public,anon;
grant execute on function public.amanah_project_structure_get(text) to authenticated;
notify pgrst,'reload schema';
