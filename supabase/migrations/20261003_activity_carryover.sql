begin;

create or replace function public.get_mobile_approved_work(
  p_equipment_id text
)
returns table(
  activity_id uuid,
  project_id text,
  project_name text,
  activity_date date,
  activity text,
  activity_item text,
  activity_quantity numeric,
  actual_quantity numeric,
  remaining_quantity numeric,
  description text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  priority text,
  activity_status text,
  approval_status text,
  equipment_id text,
  equipment_name text,
  assigned_equipment_count integer,
  claimed_equipment_count integer,
  eligible_equipment_count integer,
  is_carryover boolean,
  carryover_from_date date,
  selection_available boolean,
  selection_reason text
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  return query
  with assigned as (
    select pae.activity_id, pae.equipment_id
    from public.project_activity_equipment pae
    where pae.equipment_id::text = p_equipment_id::text
  ),
  all_assigned as (
    select pae.activity_id, count(*)::integer as assigned_equipment_count
    from public.project_activity_equipment pae
    group by pae.activity_id
  ),
  actual as (
    select aa.project_activity_id, round(coalesce(sum(aa.quantity), 0), 2) as actual_quantity
    from public.attendance_activities aa
    where aa.project_activity_id is not null
    group by aa.project_activity_id
  ),
  today_claims as (
    select
      a.project_activity_id,
      count(distinct a.equipment_id)::integer as claimed_equipment_count,
      bool_or(a.equipment_id::text = p_equipment_id::text) as equipment_already_claimed
    from public.attendance a
    join public.project_activity_equipment pae
      on pae.activity_id = a.project_activity_id
     and pae.equipment_id::text = a.equipment_id::text
    where a.attendance_date = v_today
      and a.project_activity_id is not null
      and a.equipment_id is not null
      and upper(coalesce(a.status, '')) in ('IN', 'COMPLETED')
    group by a.project_activity_id
  )
  select
    pa.activity_id,
    pa.project_id::text,
    pa.project_name,
    pa.activity_date,
    pa.activity,
    pa.activity_item,
    pa.activity_quantity,
    coalesce(ac.actual_quantity, 0),
    greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0),
    pa.description,
    pa.scheduled_start,
    pa.scheduled_end,
    pa.priority,
    pa.activity_status,
    pa.approval_status,
    p_equipment_id::text,
    coalesce(e.equipment_name, 'Equipment'),
    aa.assigned_equipment_count,
    coalesce(tc.claimed_equipment_count, 0),
    case
      when pa.activity_date < v_today
        then least(
          ceil(greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0))::integer,
          aa.assigned_equipment_count
        )
      else aa.assigned_equipment_count
    end,
    (pa.activity_date < v_today),
    case when pa.activity_date < v_today then pa.activity_date else null end,
    case
      when upper(coalesce(pa.activity_status, '')) in ('DONE', 'CANCELLED', 'NOT DONE', 'REJECTED') then false
      when pa.activity_date < v_today then
        greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0) > 0
        and coalesce(tc.claimed_equipment_count, 0) <
            least(
              ceil(greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0))::integer,
              aa.assigned_equipment_count
            )
        and not coalesce(tc.equipment_already_claimed, false)
      else true
    end,
    case
      when upper(coalesce(pa.activity_status, '')) = 'DONE' then 'Activity is DONE.'
      when upper(coalesce(pa.activity_status, '')) in ('CANCELLED', 'NOT DONE', 'REJECTED') then 'Activity is not available for Time IN.'
      when pa.activity_date < v_today and greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0) <= 0 then 'No quantity remains.'
      when pa.activity_date < v_today and coalesce(tc.equipment_already_claimed, false) then 'This equipment already claimed this carryover activity today.'
      when pa.activity_date < v_today and coalesce(tc.claimed_equipment_count, 0) >= least(
        ceil(greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0))::integer,
        aa.assigned_equipment_count
      ) then 'The available carryover equipment slots have already been claimed today.'
      else null
    end
  from assigned selected
  join public.project_activities pa on pa.activity_id = selected.activity_id
  join all_assigned aa on aa.activity_id = pa.activity_id
  left join actual ac on ac.project_activity_id = pa.activity_id
  left join today_claims tc on tc.project_activity_id = pa.activity_id
  left join public.equipment e on e.equipment_id::text = p_equipment_id::text
  where upper(coalesce(pa.approval_status, '')) = 'APPROVED'
    and pa.activity_date >= (v_today - 7)
    and pa.activity_date < (v_today + 7)
  order by
    case when pa.activity_status = 'DONE' then 2 else 0 end,
    case when pa.activity_date < v_today then 0 else 1 end,
    pa.activity_date,
    pa.scheduled_start,
    pa.activity;
end;
$function$;

grant execute on function public.get_mobile_approved_work(text) to authenticated;

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
  v_today date := coalesce(p_attendance_date, (now() at time zone 'Asia/Manila')::date);
  v_actual numeric := 0;
  v_remaining numeric := 0;
  v_assigned_count integer := 0;
  v_claimed_count integer := 0;
  v_equipment_already_claimed boolean := false;
  v_eligible_count integer := 0;
begin
  select * into v_employee from public.employees
  where employee_id::text = p_employee_id::text and upper(coalesce(status, '')) = 'ACTIVE' limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Employee is not active or was not found.');
  end if;

  select * into v_equipment from public.equipment
  where equipment_id::text = p_equipment_id::text and upper(coalesce(status, '')) = 'ACTIVE' limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Equipment is not active or was not found.');
  end if;

  select * into v_activity
  from public.project_activities
  where activity_id = p_project_activity_id
    and upper(coalesce(approval_status, '')) = 'APPROVED'
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'The selected approved activity was not found or is not approved.');
  end if;

  if upper(coalesce(v_activity.activity_status, '')) in ('DONE', 'CANCELLED', 'NOT DONE', 'REJECTED') then
    return jsonb_build_object(
      'success', false,
      'error', case when upper(coalesce(v_activity.activity_status, '')) = 'DONE'
        then 'This activity is already DONE and cannot be selected again.'
        else 'This activity is not available for Time IN.' end
    );
  end if;

  if not exists (
    select 1 from public.project_activity_equipment pae
    where pae.activity_id = p_project_activity_id and pae.equipment_id::text = p_equipment_id::text
  ) then
    return jsonb_build_object('success', false, 'error', 'The selected activity is not assigned to this equipment.');
  end if;

  if v_activity.activity_date < v_today then
    select coalesce(sum(aa.quantity), 0) into v_actual
    from public.attendance_activities aa
    where aa.project_activity_id = p_project_activity_id;

    v_remaining := greatest(coalesce(v_activity.activity_quantity, 0) - v_actual, 0);

    if v_remaining <= 0 then
      return jsonb_build_object('success', false, 'error', 'This carryover activity has no remaining quantity.');
    end if;

    select count(*) into v_assigned_count
    from public.project_activity_equipment pae
    where pae.activity_id = p_project_activity_id;

    v_eligible_count := least(ceil(v_remaining)::integer, v_assigned_count);

    select count(distinct a.equipment_id) into v_claimed_count
    from public.attendance a
    join public.project_activity_equipment pae
      on pae.activity_id = a.project_activity_id
     and pae.equipment_id::text = a.equipment_id::text
    where a.attendance_date = v_today
      and a.project_activity_id = p_project_activity_id
      and a.equipment_id is not null
      and upper(coalesce(a.status, '')) in ('IN', 'COMPLETED');

    select exists(
      select 1 from public.attendance a
      where a.attendance_date = v_today
        and a.project_activity_id = p_project_activity_id
        and a.equipment_id::text = p_equipment_id::text
        and upper(coalesce(a.status, '')) in ('IN', 'COMPLETED')
    ) into v_equipment_already_claimed;

    if v_equipment_already_claimed then
      return jsonb_build_object('success', false, 'error', 'This equipment already claimed the carryover activity today.');
    end if;

    if v_claimed_count >= v_eligible_count then
      return jsonb_build_object('success', false, 'error', 'The available carryover equipment slots have already been claimed today.');
    end if;
  end if;

  v_meter_type := upper(btrim(coalesce(p_meter_type, v_equipment.meter_type, '')));
  if v_meter_type not in ('ODOMETER', 'HOUR METER') then
    v_meter_type := case
      when upper(coalesce(v_equipment.equipment_type, '')) like '%TRUCK%'
        or upper(coalesce(v_equipment.equipment_type, '')) like '%DUMP%'
        or upper(coalesce(v_equipment.equipment_type, '')) like '%TRACTOR HEAD%'
        then 'ODOMETER' else 'HOUR METER' end;
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
    select * into v_project from public.projects
    where project_id::text = p_project_id::text and upper(coalesce(status, '')) = 'ACTIVE' limit 1;
    if not found then
      return jsonb_build_object('success', false, 'error', 'The selected project is not active or was not found.');
    end if;
  elsif nullif(btrim(coalesce(p_project_name, '')), '') is null then
    return jsonb_build_object('success', false, 'error', 'Project / location is required.');
  end if;

  if exists (
    select 1 from public.attendance
    where employee_id::text = p_employee_id::text and upper(coalesce(status, '')) = 'IN'
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
    p_employee_id, v_employee.employee_name, v_today, coalesce(p_time_in, now()), null, null, 'IN',
    p_equipment_id, v_equipment.equipment_name,
    case when p_project_id is null or btrim(p_project_id) = '' then null else p_project_id end,
    btrim(p_project_name), p_project_activity_id,
    v_meter_type, p_meter_in, null, null, v_meter_unit, false, null, null, null
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

commit;