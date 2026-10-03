begin;

create or replace function public.prepare_attendance_out(
  p_attendance_id text,
  p_employee_id text,
  p_meter_out numeric,
  p_activities jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  rec public.attendance%rowtype;
  v_meter_type text;
  v_meter_unit text;
  v_meter_in numeric;
  v_meter_used numeric;
  v_activity jsonb;
  v_count integer := 0;
  v_project_activity_id uuid;
begin
  select *
  into rec
  from public.attendance
  where attendance_id::text = p_attendance_id
    and employee_id::text = p_employee_id
    and upper(coalesce(status, '')) = 'IN'
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'No active attendance was found for this employee.');
  end if;

  v_meter_type := upper(btrim(coalesce(rec.meter_type, 'HOUR METER')));
  if v_meter_type not in ('ODOMETER', 'HOUR METER') then
    v_meter_type := 'HOUR METER';
  end if;

  v_meter_unit := case when v_meter_type = 'ODOMETER' then 'KM' else 'HRS' end;
  v_meter_in := rec.meter_in;

  if v_meter_in is null then
    return jsonb_build_object('success', false, 'error', 'This attendance record has no Meter In value. Please close the old attendance record before using the new workflow.');
  end if;

  if p_meter_out is null then
    return jsonb_build_object('success', false, 'error', 'Meter Out is required.');
  end if;

  if p_meter_out < v_meter_in then
    return jsonb_build_object('success', false, 'error', 'Meter Out cannot be lower than Meter In.');
  end if;

  if jsonb_typeof(coalesce(p_activities, '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('success', false, 'error', 'Activity data must be an array.');
  end if;

  if jsonb_array_length(coalesce(p_activities, '[]'::jsonb)) = 0 then
    return jsonb_build_object('success', false, 'error', 'At least one activity is required.');
  end if;

  if rec.project_activity_id is not null then
    v_project_activity_id := rec.project_activity_id;
  end if;

  for v_activity in select value from jsonb_array_elements(p_activities)
  loop
    if nullif(btrim(v_activity->>'activity_category'), '') is null then
      return jsonb_build_object('success', false, 'error', 'Every activity needs a category.');
    end if;

    if nullif(btrim(v_activity->>'activity_description'), '') is null then
      return jsonb_build_object('success', false, 'error', 'Every activity needs a description.');
    end if;

    if (v_activity->>'quantity')::numeric <= 0 then
      return jsonb_build_object('success', false, 'error', 'Every activity quantity must be greater than zero.');
    end if;
  end loop;

  v_meter_used := round((p_meter_out - v_meter_in)::numeric, 2);

  update public.attendance
  set
    meter_type = v_meter_type,
    meter_out = p_meter_out,
    meter_used = v_meter_used,
    meter_unit = v_meter_unit
  where attendance_id::text = p_attendance_id
    and employee_id::text = p_employee_id
    and upper(coalesce(status, '')) = 'IN';

  if not found then
    return jsonb_build_object('success', false, 'error', 'Attendance could not be updated with Meter Out.');
  end if;

  if rec.equipment_id is not null then
    update public.equipment
    set
      meter_type = v_meter_type,
      current_meter_reading = greatest(coalesce(current_meter_reading, 0), p_meter_out)
    where equipment_id::text = rec.equipment_id::text;
  end if;

  delete from public.attendance_activities
  where attendance_id = rec.attendance_id::text;

  for v_activity in select value from jsonb_array_elements(p_activities)
  loop
    insert into public.attendance_activities (
      attendance_id,
      project_activity_id,
      activity_category,
      activity_description,
      quantity,
      photo_1_path,
      photo_2_path
    )
    values (
      rec.attendance_id::text,
      v_project_activity_id,
      btrim(v_activity->>'activity_category'),
      btrim(v_activity->>'activity_description'),
      (v_activity->>'quantity')::numeric,
      nullif(btrim(v_activity->>'photo_1_path'), ''),
      nullif(btrim(v_activity->>'photo_2_path'), '')
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'attendance_id', rec.attendance_id::text,
    'project_activity_id', v_project_activity_id,
    'meter_type', v_meter_type,
    'meter_unit', v_meter_unit,
    'meter_in', v_meter_in,
    'meter_out', p_meter_out,
    'meter_used', v_meter_used,
    'activity_count', v_count
  );

exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

commit;