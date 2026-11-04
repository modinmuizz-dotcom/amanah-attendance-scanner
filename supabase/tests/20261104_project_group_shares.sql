-- Run after the group-share migration. Every test fixture is rolled back.
begin;
select set_config('amanah.share_test_project','__group_share_test__'||gen_random_uuid()::text,true);
select set_config('amanah.share_legacy_project','__group_share_legacy__'||gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(
  select ur.auth_user_id from public.amanah_user_roles ur
  join public.amanah_role_permissions rp using(role_id)
  join public.amanah_permissions p using(permission_id)
  where p.permission_key='schedule.manage' order by ur.auth_user_id limit 1
),'email','group-share-test@example.invalid')::text,true);
do $$ begin
  if auth.uid() is null then raise exception 'A scheduling manager account is required for this test.'; end if;
  if has_function_privilege('anon','public.amanah_project_structure_get_v2(text)','EXECUTE') or
     has_function_privilege('anon','public.amanah_project_structure_write_v2(text,text,jsonb,bigint,text)','EXECUTE') or
     has_function_privilege('anon','amanah_private.apply_structure_command_v2(text,text,jsonb,bigint,text)','EXECUTE') then
    raise exception 'Anonymous execution must be disabled.';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in('amanah_project_structure_get_v2','amanah_project_structure_write_v2') and p.prosecdef) then
    raise exception 'The public entry points must use invoker permissions.';
  end if;
end $$;
insert into public.projects(project_id,project_name,project_type,status) values
  (current_setting('amanah.share_test_project'),'Group share automated test','SCHOOL BUILDING','ACTIVE'),
  (current_setting('amanah.share_legacy_project'),'Legacy share conversion test','MULTI PURPOSE BUILDING','ACTIVE');
set local role authenticated;
do $$
declare p text:=current_setting('amanah.share_test_project');
  old_p text:=current_setting('amanah.share_legacy_project');
  g jsonb:=jsonb_build_array(
    jsonb_build_object('id',gen_random_uuid(),'name','STRUCTURAL WORK','share',60,'items',jsonb_build_array(
      jsonb_build_object('id',gen_random_uuid(),'name','EXCAVATION','location','','weight',50,'planned_start',null,'planned_end',null),
      jsonb_build_object('id',gen_random_uuid(),'name','FOOTING','location','','weight',10,'planned_start',null,'planned_end',null))),
    jsonb_build_object('id',gen_random_uuid(),'name','ARCHITECTURAL WORK','share',40,'items',jsonb_build_array(
      jsonb_build_object('id',gen_random_uuid(),'name','CHB PILE','location','','weight',100,'planned_start',null,'planned_end',null))));
  r jsonb;bad jsonb;legacy jsonb;converted jsonb;claims text:=current_setting('request.jwt.claims');
begin
  r:=public.amanah_project_structure_write_v2(p,'SAVE',g,0,'');
  if r->>'status'<>'DRAFT' or (r->>'revision')::int<>1 or (r->>'weight_model')::int<>2 then
    raise exception 'Hierarchical draft save failed.';
  end if;
  if public.amanah_project_structure_get_v2(p)#>'{structure,groups}'<>g then raise exception 'Draft read changed its percentages.'; end if;
  begin perform public.amanah_project_structure_write_v2(p,'BASELINE',null,1,'');raise exception 'Accepted a group with incomplete item shares.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{1,share}','41');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted project group shares over 100%%.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,items,1,weight}','51');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted group item shares over 100%%.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,share}','-1');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted a negative group share.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,share}','0.123');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted excessive group precision.';
  exception when invalid_parameter_value then null; end;
  bad:=g#-'{0,share}';
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted a missing group share.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,items,0,weight}','-1');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted a negative item share.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,items,0,weight}','0.123');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted excessive item precision.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,items,1,id}',g#>'{0,items,0,id}');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted duplicate item IDs.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(jsonb_set(g,'{0,items,0,planned_start}','"2026-11-10"'),'{0,items,0,planned_end}','"2026-11-01"');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted reversed planned dates.';
  exception when invalid_parameter_value then null; end;
  bad:=jsonb_set(g,'{0,progress}','90');
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',bad,1,'');raise exception 'Accepted unsupported progress data.';
  exception when invalid_parameter_value then null; end;
  begin perform public.amanah_project_structure_write(p,'SAVE',g,1,'');raise exception 'Old client overwrote a hierarchical structure.';
  exception when invalid_parameter_value then null; end;
  begin perform public.amanah_project_structure_get(p);raise exception 'Old client read group shares as global item weights.';
  exception when invalid_parameter_value then null; end;
  g:=jsonb_set(g,'{0,items,1,weight}','50');
  r:=public.amanah_project_structure_write_v2(p,'SAVE',g,1,'');
  if (r->>'revision')::int<>2 then raise exception 'Revision was not incremented.'; end if;
  if ((r#>>'{groups,0,share}')::numeric * (r#>>'{groups,0,items,0,weight}')::numeric /100)<>30 then
    raise exception '60%% group x 50%% item must contribute 30%% to the project.';
  end if;
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',g,1,'');raise exception 'Accepted a stale save.';
  exception when serialization_failure then null; end;
  r:=public.amanah_project_structure_write_v2(p,'BASELINE',null,2,'');
  if r->>'status'<>'BASELINED' or (r->>'revision')::int<>3 then raise exception 'Valid group shares could not be baselined.'; end if;
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',g,3,'');raise exception 'Changed a locked baseline.';
  exception when invalid_parameter_value then null; end;
  begin perform public.amanah_project_structure_write_v2(p,'REOPEN',null,3,'');raise exception 'Reopened without a reason.';
  exception when invalid_parameter_value then null; end;
  r:=public.amanah_project_structure_write_v2(p,'REOPEN',null,3,'Revise group allocation for approved scope');
  if r->>'status'<>'DRAFT' or (r->>'baseline_version')::int<>2 or (r->>'revision')::int<>4 then raise exception 'Baseline revision failed.'; end if;
  g:=jsonb_set(jsonb_set(g,'{0,share}','50'),'{1,share}','50');
  r:=public.amanah_project_structure_write_v2(p,'SAVE',g,4,'');
  if (r#>>'{groups,0,items,0,weight}')::numeric<>50 or (r#>>'{groups,0,share}')::numeric<>50 then
    raise exception 'Editing a group share changed its item allocation.';
  end if;
  if not exists(select 1 from public.project_work_structure_events where project_id=p and event_type='BASELINE_SET'
    and baseline_version=1 and details#>>'{groups,0,share}'='60' and details->>'weight_model'='2') then
    raise exception 'Prior hierarchical baseline snapshot was lost.';
  end if;
  if (select count(*) from public.project_work_structure_events where project_id=p)<>5 then
    raise exception 'Failed actions must not append events.';
  end if;
  -- Legacy percentages stay stored exactly as saved until an authorized write.
  legacy:=jsonb_set(jsonb_set((g#-'{0,share}')#-'{1,share}','{0,items,0,weight}','50'),'{0,items,1,weight}','10');
  legacy:=jsonb_set(legacy,'{1,items,0,weight}','0');
  perform public.amanah_project_structure_write(old_p,'SAVE',legacy,0,'');
  converted:=public.amanah_project_structure_get_v2(old_p)#>'{structure,groups}';
  if (converted#>>'{0,share}')::numeric<>60 or (converted#>>'{0,items,0,weight}')::numeric<>83.33 or
     (converted#>>'{0,items,1,weight}')::numeric<>16.67 or (converted#>>'{1,share}')::numeric<>0 then
    raise exception 'Legacy partial draft did not convert using complete within-group percentages.';
  end if;
  if not exists(select 1 from public.project_work_structures where project_id=old_p and weight_model=1 and groups=legacy) then
    raise exception 'Reading the legacy draft modified its stored scope.';
  end if;
  legacy:=jsonb_set(jsonb_set(jsonb_set(legacy,'{0,items,0,weight}','30'),'{0,items,1,weight}','30'),'{1,items,0,weight}','40');
  perform public.amanah_project_structure_write(old_p,'SAVE',legacy,1,'');
  perform public.amanah_project_structure_write(old_p,'BASELINE',null,2,'');
  converted:=public.amanah_project_structure_get_v2(old_p)#>'{structure,groups}';
  if (converted#>>'{0,share}')::numeric<>60 or (converted#>>'{0,items,0,weight}')::numeric<>50 then
    raise exception 'Legacy baseline did not preserve its project allocation.';
  end if;
  r:=public.amanah_project_structure_write_v2(old_p,'REOPEN',null,3,'Adopt editable project group shares');
  if (r->>'weight_model')::int<>2 or r->'groups'<>converted then raise exception 'Reopened legacy baseline was not converted.'; end if;
  if not exists(select 1 from public.project_work_structure_events where project_id=old_p and event_type='BASELINE_REOPENED'
    and details->>'weight_model'='1' and details->'groups'=legacy) then raise exception 'Original legacy snapshot was lost.'; end if;
  -- Exact decimal allocations survive storage and independent validation.
  g:=jsonb_set(jsonb_set(g,'{0,share}','33.33'),'{1,share}','66.67');
  g:=jsonb_set(jsonb_set(g,'{0,items,0,weight}','33.33'),'{0,items,1,weight}','66.67');
  perform public.amanah_project_structure_write_v2(p,'SAVE',g,5,'');
  perform public.amanah_project_structure_write_v2(p,'BASELINE',null,6,'');
  begin update public.project_work_structures set weight_model=1 where project_id=p;raise exception 'Direct writes bypassed permissions.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',gen_random_uuid())::text,true);
  if exists(select 1 from public.project_work_structures) then raise exception 'RLS exposed structures to an unassigned user.'; end if;
  begin perform public.amanah_project_structure_get_v2(p);raise exception 'Unassigned user read project shares.';
  exception when insufficient_privilege then null; end;
  begin perform public.amanah_project_structure_write_v2(p,'SAVE',g,7,'');raise exception 'Unassigned user changed project shares.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.amanah_project_structure_get_v2(p);raise exception 'Anonymous identity read project shares.';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',claims,true);
end $$;
reset role;
rollback;
select 'Group shares, independent item allocations, legacy conversion, baseline history, concurrency and permissions passed; all fixtures rolled back.' as validation;
