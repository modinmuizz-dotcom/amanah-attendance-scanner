-- Editable group project shares with item percentages within each group.
-- Stored legacy baselines are preserved; reads convert their allocation for the
-- new interface, and old clients cannot overwrite a saved v2 structure.
alter table public.project_work_structures add column weight_model smallint not null default 1 check(weight_model in(1,2));
comment on column public.project_work_structures.weight_model is '1: item shares of the project; 2: group project shares with item shares within their group.';
create function amanah_private.work_groups_to_v2(p_groups jsonb,p_model smallint)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare g jsonb;v_total numeric;v_items jsonb;v_groups jsonb:='[]'::jsonb;
begin
  if p_model=2 then return p_groups; end if;
  if p_model<>1 or p_model is null then raise exception 'Unknown weight model.' using errcode='22023'; end if;
  for g in select value from jsonb_array_elements(p_groups) loop
    select coalesce(sum((value->>'weight')::numeric),0) into v_total from jsonb_array_elements(g->'items');
    if v_total>0 then
      with raw as (
        select value as item,ordinality as n from jsonb_array_elements(g->'items') with ordinality
      ), weighted as (
        select *,((item->>'weight')::numeric/v_total)*10000 as ideal from raw
      ), base as (
        select *,floor(ideal) as units from weighted
      ), ranked as (
        select *,row_number() over(order by ideal-units desc,n) as rank,sum(units) over() as base_total from base
      )
      select coalesce(jsonb_agg(jsonb_set(item,'{weight}',to_jsonb((units+case when rank<=10000-base_total then 1 else 0 end)/100)) order by n),'[]'::jsonb)
        into v_items from ranked;
    else v_items:=g->'items';
    end if;
    v_groups:=v_groups||jsonb_build_array(jsonb_set(jsonb_set(g,'{share}',to_jsonb(v_total)),'{items}',v_items));
  end loop;
  return v_groups;
end $$;
revoke all on function amanah_private.work_groups_to_v2(jsonb,smallint) from public,anon;
grant execute on function amanah_private.work_groups_to_v2(jsonb,smallint) to authenticated;

CREATE OR REPLACE FUNCTION amanah_private.validate_work_groups_v2(p_groups jsonb, p_final boolean)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare g jsonb; i jsonb; v_ids text[]:='{}'; v_id text; v_total numeric:=0;
  v_weight numeric; v_share numeric; v_group_total numeric; v_count integer:=0; v_start date; v_end date;
begin
  if p_groups is null or jsonb_typeof(p_groups)<>'array' or jsonb_array_length(p_groups)>20 then
    raise exception 'Provide up to 20 work groups.' using errcode='22023';
  end if;
  if p_final and jsonb_array_length(p_groups)=0 then raise exception 'Add at least one work group.' using errcode='22023'; end if;
  for g in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(g)<>'object' or exists(select 1 from jsonb_object_keys(g) k(key) where key not in ('id','name','share','items')) then
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
    if jsonb_typeof(g->'share') is distinct from 'number' then raise exception 'Every work group needs a numeric project share.' using errcode='22023'; end if;
    v_share:=(g->>'share')::numeric;
    if v_share<0 or v_share>100 or v_share<>round(v_share,2) or (p_final and v_share=0) then
      raise exception 'Group project shares must be between 0 and 100 with at most two decimal places. Baseline groups need positive shares.' using errcode='22023';
    end if;
    v_total:=v_total+v_share;v_group_total:=0;
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
      v_group_total:=v_group_total+v_weight;
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
    if v_group_total>100 or (p_final and v_group_total<>100) then
      raise exception 'Item shares in each work group must total exactly 100%% to set a baseline; drafts may total less.' using errcode='22023';
    end if;
  end loop;
  if v_total>100 or (p_final and v_total<>100) then raise exception 'Work group project shares must total exactly 100%% to set the baseline; drafts may total less.' using errcode='22023'; end if;
  return v_total;
end $function$;
revoke all on function amanah_private.validate_work_groups_v2(jsonb,boolean) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION amanah_private.apply_structure_command(p_project_id text, p_action text, p_groups jsonb, p_expected_revision bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if v_exists and v_row.weight_model=2 then
    raise exception 'Refresh Project Structure to edit the group project shares.' using errcode='22023';
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
end $function$;
CREATE OR REPLACE FUNCTION amanah_private.apply_structure_command_v2(p_project_id text, p_action text, p_groups jsonb, p_expected_revision bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid;v_type text;v_row public.project_work_structures%rowtype;
  v_exists boolean;v_total numeric;v_existing_groups jsonb;v_event text;v_details jsonb:='{}'::jsonb;
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
  if v_exists then v_existing_groups:=amanah_private.work_groups_to_v2(v_row.groups,v_row.weight_model); end if;
  if p_action='SAVE' then
    if v_exists and v_row.status<>'DRAFT' then raise exception 'Reopen the baseline before changing its scope or weights.' using errcode='22023'; end if;
    v_total:=amanah_private.validate_work_groups_v2(p_groups,false);
    if v_exists then
      update public.project_work_structures set groups=p_groups,weight_model=2,project_type=v_type,revision=revision+1,updated_by=v_actor,updated_at=now()
        where project_id=p_project_id returning * into v_row;
    else
      insert into public.project_work_structures(project_id,project_type,groups,weight_model,created_by,updated_by)
        values(p_project_id,v_type,p_groups,2,v_actor,v_actor) returning * into v_row;
    end if;
    v_event:='DRAFT_SAVED';v_details:=jsonb_build_object('group_share_total',v_total,'weight_model',2);
  elsif p_action='BASELINE' then
    if not v_exists or v_row.status<>'DRAFT' then raise exception 'Save a draft before setting its baseline.' using errcode='22023'; end if;
    if v_row.project_type<>v_type then raise exception 'The project type has changed. Review and save the draft first.' using errcode='22023'; end if;
    v_total:=amanah_private.validate_work_groups_v2(v_existing_groups,true);
    update public.project_work_structures set groups=v_existing_groups,weight_model=2,status='BASELINED',baselined_at=now(),baselined_by=v_actor,revision=revision+1,updated_by=v_actor,updated_at=now()
      where project_id=p_project_id returning * into v_row;
    v_event:='BASELINE_SET';v_details:=jsonb_build_object('groups',v_row.groups,'group_share_total',v_total,'weight_model',2);
  else
    if not v_exists or v_row.status<>'BASELINED' then raise exception 'Only a saved baseline can be reopened.' using errcode='22023'; end if;
    if length(btrim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Enter a revision reason of 10 to 1000 characters.' using errcode='22023'; end if;
    v_details:=jsonb_build_object('previous_baseline_version',v_row.baseline_version,'groups',v_row.groups,'weight_model',v_row.weight_model);
    update public.project_work_structures set groups=v_existing_groups,weight_model=2,status='DRAFT',baseline_version=baseline_version+1,baselined_at=null,baselined_by=null,revision=revision+1,updated_by=v_actor,updated_at=now()
      where project_id=p_project_id returning * into v_row;
    v_event:='BASELINE_REOPENED';
  end if;
  insert into public.project_work_structure_events(project_id,event_type,baseline_version,revision,reason,details,actor_id,actor_label)
    values(p_project_id,v_event,v_row.baseline_version,v_row.revision,
      case when p_action='REOPEN' then btrim(p_reason) else '' end,v_details,v_actor,coalesce(auth.jwt()->>'email','Authorized team member'));
  return to_jsonb(v_row);
end $function$;
revoke all on function amanah_private.apply_structure_command_v2(text,text,jsonb,bigint,text) from public,anon;
grant execute on function amanah_private.apply_structure_command_v2(text,text,jsonb,bigint,text) to authenticated;
CREATE OR REPLACE FUNCTION public.amanah_project_structure_get(p_project_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_project record;v_structure jsonb;v_events jsonb;
begin
  perform amanah_private.require_structure_access(false);
  select project_id,project_name,project_type,location,status into v_project from public.projects where project_id=p_project_id;
  if not found then raise exception 'Project not found.' using errcode='23503'; end if;
  if v_project.project_type is null or v_project.project_type not in ('SCHOOL BUILDING','MULTI PURPOSE BUILDING','COVERED COURT','WATER SYSTEM') then
    raise exception 'Select a school building, multi-purpose building, covered court or water system.' using errcode='22023';
  end if;
  select to_jsonb(s) into v_structure from public.project_work_structures s where s.project_id=p_project_id;
  if v_structure->>'weight_model'='2' then raise exception 'Refresh Project Structure to use editable group project shares.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(e order by e.event_id desc),'[]'::jsonb) into v_events from (
    select event_id,event_type,baseline_version,revision,reason,actor_label,occurred_at
    from public.project_work_structure_events where project_id=p_project_id order by event_id desc limit 20
  ) e;
  return jsonb_build_object('project',to_jsonb(v_project),'structure',v_structure,'events',v_events,
    'can_manage',public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));
end $function$;
CREATE OR REPLACE FUNCTION public.amanah_project_structure_get_v2(p_project_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_project record;v_structure jsonb;v_events jsonb;
begin
  perform amanah_private.require_structure_access(false);
  select project_id,project_name,project_type,location,status into v_project from public.projects where project_id=p_project_id;
  if not found then raise exception 'Project not found.' using errcode='23503'; end if;
  if v_project.project_type is null or v_project.project_type not in ('SCHOOL BUILDING','MULTI PURPOSE BUILDING','COVERED COURT','WATER SYSTEM') then
    raise exception 'Select a school building, multi-purpose building, covered court or water system.' using errcode='22023';
  end if;
  select to_jsonb(s) into v_structure from public.project_work_structures s where s.project_id=p_project_id;
  if v_structure is not null then
    v_structure:=jsonb_set(jsonb_set(v_structure,'{groups}',amanah_private.work_groups_to_v2(v_structure->'groups',(v_structure->>'weight_model')::smallint)),'{weight_model}','2'::jsonb);
  end if;
  select coalesce(jsonb_agg(e order by e.event_id desc),'[]'::jsonb) into v_events from (
    select event_id,event_type,baseline_version,revision,reason,actor_label,occurred_at
    from public.project_work_structure_events where project_id=p_project_id order by event_id desc limit 20
  ) e;
  return jsonb_build_object('project',to_jsonb(v_project),'structure',v_structure,'events',v_events,
    'can_manage',public.amanah_has_permission('master_data.projects') or public.amanah_has_permission('schedule.manage'));
end $function$;
revoke all on function public.amanah_project_structure_get_v2(text) from public,anon;
grant execute on function public.amanah_project_structure_get_v2(text) to authenticated;
CREATE OR REPLACE FUNCTION public.amanah_project_structure_write_v2(p_project_id text, p_action text, p_groups jsonb DEFAULT NULL::jsonb, p_expected_revision bigint DEFAULT 0, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select amanah_private.apply_structure_command_v2(p_project_id,p_action,p_groups,p_expected_revision,p_reason);
$function$;
revoke all on function public.amanah_project_structure_write_v2(text,text,jsonb,bigint,text) from public,anon;
grant execute on function public.amanah_project_structure_write_v2(text,text,jsonb,bigint,text) to authenticated;
notify pgrst,'reload schema';
