-- Run after the Project Structure migration. All fixtures are rolled back.
begin;
select set_config('amanah.structure_test_project','__structure_test__'||gen_random_uuid()::text,true);
select set_config('amanah.structure_road_test_project','__structure_road_test__'||gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(
  select ur.auth_user_id from public.amanah_user_roles ur
  join public.amanah_role_permissions rp using(role_id)
  join public.amanah_permissions p using(permission_id)
  where p.permission_key='schedule.manage' order by ur.auth_user_id limit 1
),'email','structure-test@example.invalid')::text,true);
do $$ begin
  if auth.uid() is null then raise exception 'A scheduling manager account is required for this test.'; end if;
  if has_table_privilege('anon','public.project_work_structures','SELECT') or
     has_table_privilege('authenticated','public.project_work_structures','INSERT') or
     has_table_privilege('authenticated','public.project_work_structures','UPDATE') or
     has_table_privilege('authenticated','public.project_work_structure_events','INSERT') then
    raise exception 'Direct table grants are too broad.';
  end if;
  if has_function_privilege('anon','public.amanah_project_structure_get(text)','EXECUTE') or
     has_function_privilege('anon','public.amanah_project_structure_write(text,text,jsonb,bigint,text)','EXECUTE') then
    raise exception 'Anonymous RPC execution must be disabled.';
  end if;
end $$;
insert into public.projects(project_id,project_name,project_type,status) values
  (current_setting('amanah.structure_test_project'),'Project Structure automated test','SCHOOL BUILDING','ACTIVE'),
  (current_setting('amanah.structure_road_test_project'),'Road structure isolation test','CONCRETING OF ROAD','ACTIVE');
set local role authenticated;
do $$
declare p text:=current_setting('amanah.structure_test_project');
  g jsonb:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','STRUCTURAL WORK','items',
    jsonb_build_array(
      jsonb_build_object('id',gen_random_uuid(),'name','EXCAVATION','location','','weight',40,'planned_start',null,'planned_end',null),
      jsonb_build_object('id',gen_random_uuid(),'name','FOOTING','location','','weight',40,'planned_start',null,'planned_end',null)
    )));
  r jsonb;bad jsonb;before_count integer;claims text:=current_setting('request.jwt.claims');
begin
  r:=public.amanah_project_structure_write(p,'SAVE',g,0,'');
  if r->>'status'<>'DRAFT' or (r->>'revision')::int<>1 then raise exception 'Draft save failed.'; end if;
  if (public.amanah_project_structure_get(p)->>'can_manage')::boolean is not true then raise exception 'Manager cannot reopen saved draft.'; end if;
  begin
    perform public.amanah_project_structure_write(p,'BASELINE',null,1,'');
    raise exception 'Accepted an incomplete baseline.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,items,0,weight}','-1');
  begin perform public.amanah_project_structure_write(p,'SAVE',bad,1,'');raise exception 'Accepted negative weight.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,items,0,weight}','0.123');
  begin perform public.amanah_project_structure_write(p,'SAVE',bad,1,'');raise exception 'Accepted excessive weight precision.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,items,1,id}',g#>'{0,items,0,id}');
  begin perform public.amanah_project_structure_write(p,'SAVE',bad,1,'');raise exception 'Accepted duplicate item IDs.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(jsonb_set(g,'{0,items,0,planned_start}','"2026-11-10"'),'{0,items,0,planned_end}','"2026-11-01"');
  begin perform public.amanah_project_structure_write(p,'SAVE',bad,1,'');raise exception 'Accepted reversed dates.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,items,0,progress}','90');
  begin perform public.amanah_project_structure_write(p,'SAVE',bad,1,'');raise exception 'Accepted unexpected progress fields.';
  exception when invalid_parameter_value then null; end;
  g:=jsonb_set(jsonb_set(g,'{0,items,0,weight}','50'),'{0,items,1,weight}','50');
  r:=public.amanah_project_structure_write(p,'SAVE',g,1,'');
  if (r->>'revision')::int<>2 then raise exception 'Draft revision not incremented.'; end if;
  begin perform public.amanah_project_structure_write(p,'SAVE',g,1,'');raise exception 'Accepted a stale revision.';
  exception when serialization_failure then null; end;
  r:=public.amanah_project_structure_write(p,'BASELINE',null,2,'');
  if r->>'status'<>'BASELINED' or (r->>'revision')::int<>3 then raise exception 'Baseline activation failed.'; end if;
  begin perform public.amanah_project_structure_write(p,'SAVE',g,3,'');raise exception 'Modified a locked baseline.';
  exception when invalid_parameter_value then null; end;
  begin perform public.amanah_project_structure_write(p,'REOPEN',null,3,'');raise exception 'Reopened without a revision reason.';
  exception when invalid_parameter_value then null; end;
  r:=public.amanah_project_structure_write(p,'REOPEN',null,3,'Correct the scope allocation');
  if r->>'status'<>'DRAFT' or (r->>'baseline_version')::int<>2 or (r->>'revision')::int<>4 then raise exception 'Baseline revision failed.'; end if;
  g:=jsonb_set(jsonb_set(g,'{0,items,0,weight}','25'),'{0,items,1,weight}','75');
  perform public.amanah_project_structure_write(p,'SAVE',g,4,'');
  if not exists(select 1 from public.project_work_structure_events where project_id=p and event_type='BASELINE_SET' and baseline_version=1 and details#>>'{groups,0,items,0,weight}'='50') then
    raise exception 'Original baseline snapshot was not preserved.';
  end if;
  select count(*) into before_count from public.project_work_structure_events where project_id=p;
  if before_count<>5 then raise exception 'Unexpected event count; failed actions must not create events.'; end if;
  begin perform public.amanah_project_structure_write(current_setting('amanah.structure_road_test_project'),'SAVE',g,0,'');raise exception 'New workflow accepted a road project.';
  exception when invalid_parameter_value then null; end;
  begin update public.project_work_structures set status='BASELINED' where project_id=p;raise exception 'Direct writes bypassed the command.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',gen_random_uuid())::text,true);
  if exists(select 1 from public.project_work_structures) then raise exception 'RLS exposed structures to an unassigned user.'; end if;
  begin perform public.amanah_project_structure_get(p);raise exception 'Unassigned user read the project structure.';
  exception when insufficient_privilege then null; end;
  begin perform public.amanah_project_structure_write(p,'SAVE',g,5,'');raise exception 'Unassigned user changed the project structure.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.amanah_project_structure_get(p);raise exception 'Anonymous identity read the project structure.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',claims,true);
end $$;
reset role;
rollback;
select 'Project Structure scope, baseline, concurrency and access checks passed; all fixtures rolled back.' as validation;
