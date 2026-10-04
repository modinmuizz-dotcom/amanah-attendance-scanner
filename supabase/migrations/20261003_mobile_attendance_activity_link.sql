-- Link mobile TIME IN to the exact engineer-approved project activity.
alter table public.attendance
  add column if not exists project_activity_id uuid
    references public.project_activities(activity_id)
    on delete set null;

create index if not exists idx_attendance_project_activity_id
  on public.attendance(project_activity_id);

create or replace function public.record_attendance_time_in(
  p_employee_id text,
  p_employee_name text,
  p_attendance_date date,
  p_time_in timestamptz,
  p_equipment_id text,
  p_equipment_name text,
  p_project_id text,
  p_project_name text,
  p_meter_type text,
  p_meter_in numeric,
  p_meter_unit text,
  p_project_activity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_employee public.employees%rowtype;
  v_equipment public.equipment%rowtype;
  v_project public.projects%rowtype;
  v_activity public.project_activities%rowtype;
  v_attendance public.attendance%rowtype;
  v_meter_type text;
  v_meter_unit text;
  v_master_meter numeric;
begin
  select * into v_employee
  from public.employees
  where employee_id::text = p_employee_id::text
    and upper(coalesce(status, '')) = 'ACTIVE'
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Employee is not active or was not found.');
  end if;

  select * into v_equipment
  from public.equipment
  where equipment_id::text = p_equipment_id::text
    and upper(coalesce(status, '')) = 'ACTIVE'
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Equipment is not active or was not found.');
  end if;

  select * into v_activity
  from public.project_activities
  where activity_id = p_project_activity_id
    and upper(coalesce(approval_status, '')) = 'APPROVED'
    and upper(coalesce(activity_status, '')) not in ('CANCELLED', 'NOT DONE')
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'The selected approved activity was not found or is not approved.');
  end if;

  if not exists (
    select 1
    from public.project_activity_equipment pae
    where pae.activity_id = p_project_activity_id
      and pae.equipment_id::text = p_equipment_id::text
  ) then
    return jsonb_build_object('success', false, 'error', 'The selected activity is not assigned to this equipment.');
  end if;

  v_meter_type := upper(btrim(coalesce(p_meter_type, v_equipment.meter_type, '')));

  if v_meter_type not in ('ODOMETER', 'HOUR METER') then
    v_meter_type := case
      when upper(coalesce(v_equipment.equipment_type, '')) like '%TRUCK%'
        or upper(coalesce(v_equipment.equipment_type, '')) like '%DUMP%'
        or upper(coalesce(v_equipment.equipment_type, '')) like '%TRACTOR HEAD%'
      then 'ODOMETER'
      else 'HOUR METER'
    end;
  end if;

  v_meter_unit := case when v_meter_type = 'ODOMETER' then 'KM' else 'HRS' end;

  if p_meter_in is null or p_meter_in < 0 then
    return jsonb_build_object('success', false, 'error', 'Meter In must be zero or greater.');
  end if;

  v_master_meter := coalesce(v_equipment.current_meter_reading, 0);

  if p_meter_in < v_master_meter then
    return jsonb_build_object(
      'success', false,
      'error', 'Meter In cannot be lower than the current equipment master reading (' || v_master_meter::text || ').'
    );
  end if;

  if p_project_id is not null and btrim(p_project_id) <> '' then
    select * into v_project
    from public.projects
    where project_id::text = p_project_id::text
      and upper(coalesce(status, '')) = 'ACTIVE'
    limit 1;

    if not found then
      return jsonb_build_object('success', false, 'error', 'The selected project is not active or was not found.');
    end if;
  elsif nullif(btrim(coalesce(p_project_name, '')), '') is null then
    return jsonb_build_object('success', false, 'error', 'Project / location is required.');
  end if;

  if exists (
    select 1
    from public.attendance
    where employee_id::text = p_employee_id::text
      and upper(coalesce(status, '')) = 'IN'
  ) then
    return jsonb_build_object('success', false, 'error', 'This employee already has an active TIME IN.');
  end if;

  insert into public.attendance (
    employee_id, employee_name, attendance_date, time_in, time_out, total_hours,
    status, equipment_id, equipment_name, project_id, project_name, project_activity_id,
    meter_type, meter_in, meter_out, meter_used, meter_unit,
    fuel_used, fuel_quantity, fuel_unit, fuel_amount
  )
  values (
    p_employee_id, v_employee.employee_name,
    coalesce(p_attendance_date, (now() at time zone 'Asia/Manila')::date),
    coalesce(p_time_in, now()), null, null, 'IN',
    p_equipment_id, v_equipment.equipment_name,
    case when p_project_id is null or btrim(p_project_id) = '' then null else p_project_id end,
    btrim(p_project_name), p_project_activity_id,
    v_meter_type, p_meter_in, null, null, v_meter_unit,
    false, null, null, null
  )
  returning * into v_attendance;

  return jsonb_build_object(
    'success', true,
    'attendance_id', v_attendance.attendance_id,
    'employee_id', v_attendance.employee_id,
    'employee_name', v_attendance.employee_name,
    'attendance_date', v_attendance.attendance_date,
    'time_in', v_attendance.time_in,
    'time_out', v_attendance.time_out,
    'total_hours', v_attendance.total_hours,
    'status', v_attendance.status,
    'equipment_id', v_attendance.equipment_id,
    'equipment_name', v_attendance.equipment_name,
    'project_id', v_attendance.project_id,
    'project_name', v_attendance.project_name,
    'project_activity_id', v_attendance.project_activity_id,
    'meter_type', v_attendance.meter_type,
    'meter_in', v_attendance.meter_in,
    'meter_out', v_attendance.meter_out,
    'meter_used', v_attendance.meter_used,
    'meter_unit', v_attendance.meter_unit,
    'fuel_used', v_attendance.fuel_used,
    'fuel_quantity', v_attendance.fuel_quantity,
    'fuel_unit', v_attendance.fuel_unit,
    'fuel_amount', v_attendance.fuel_amount
  );

exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;