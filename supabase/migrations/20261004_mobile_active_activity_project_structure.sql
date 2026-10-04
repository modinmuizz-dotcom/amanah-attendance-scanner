-- Include project structure on the driver's active activity.
create or replace function public.get_mobile_active_activity(
  p_attendance_id text,
  p_employee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  rec public.attendance%rowtype;
  act public.project_activities%rowtype;
  prog public.attendance_activities%rowtype;
begin
  select * into rec
  from public.attendance
  where attendance_id = p_attendance_id
    and employee_id = p_employee_id
    and upper(coalesce(status,'')) = 'IN'
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Active attendance was not found.');
  end if;

  if rec.project_activity_id is null then
    return jsonb_build_object('success', false, 'error', 'No engineer-assigned activity is linked to this attendance.');
  end if;

  select * into act
  from public.project_activities
  where activity_id = rec.project_activity_id
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Engineer-assigned activity was not found.');
  end if;

  select * into prog
  from public.attendance_activities
  where attendance_id = rec.attendance_id
    and project_activity_id = rec.project_activity_id
  order by id desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'attendance_id', rec.attendance_id,
    'project_activity_id', rec.project_activity_id,
    'equipment_id', rec.equipment_id,
    'equipment_name', rec.equipment_name,
    'project_id', rec.project_id,
    'project_name', rec.project_name,
    'phase_id', act.phase_id,
    'phase_name', (select phase_name from public.project_phases where phase_id = act.phase_id),
    'section_id', act.section_id,
    'section_name', (select section_name from public.project_sections where section_id = act.section_id),
    'work_component_id', act.work_component_id,
    'work_component_name', (select component_name from public.project_work_components where work_component_id = act.work_component_id),
    'component_side', (select component_side from public.project_work_components where work_component_id = act.work_component_id),
    'station_start_m', act.station_start_m,
    'station_end_m', act.station_end_m,
    'activity', act.activity,
    'activity_item', act.activity_item,
    'description', act.description,
    'planned_quantity', act.activity_quantity,
    'actual_quantity', coalesce(prog.quantity, 0),
    'photo_1_path', prog.photo_1_path,
    'photo_2_path', prog.photo_2_path
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

revoke all on function public.get_mobile_active_activity(text,text) from public, anon;
grant execute on function public.get_mobile_active_activity(text,text) to authenticated;
