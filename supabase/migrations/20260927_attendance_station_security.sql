/*
  AMANAH ATTENDANCE STATION SECURITY + PROJECT DROPDOWN
  -----------------------------------------------------
  Fixes:
    1) TIME IN RLS error on public.attendance
    2) Keeps the public station secure by using a SECURITY DEFINER RPC
       instead of giving anonymous users direct INSERT permission.
    3) Validates employee/equipment/project master data.
    4) Supports registered project/location selection and custom location.
*/

CREATE OR REPLACE FUNCTION public.record_attendance_time_in(
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
  p_meter_unit text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$

DECLARE
  v_employee public.employees%ROWTYPE;
  v_equipment public.equipment%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_attendance public.attendance%ROWTYPE;

  v_meter_type text;
  v_meter_unit text;
  v_master_meter numeric;
BEGIN

  SELECT *
  INTO v_employee
  FROM public.employees
  WHERE employee_id::text = p_employee_id::text
    AND upper(coalesce(status, '')) = 'ACTIVE'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Employee is not active or was not found.'
    );
  END IF;


  SELECT *
  INTO v_equipment
  FROM public.equipment
  WHERE equipment_id::text = p_equipment_id::text
    AND upper(coalesce(status, '')) = 'ACTIVE'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Equipment is not active or was not found.'
    );
  END IF;


  v_meter_type :=
    upper(
      btrim(
        coalesce(
          p_meter_type,
          v_equipment.meter_type,
          ''
        )
      )
    );

  IF v_meter_type NOT IN ('ODOMETER', 'HOUR METER') THEN
    v_meter_type :=
      CASE
        WHEN upper(coalesce(v_equipment.equipment_type, ''))
             LIKE '%TRUCK%'
          OR upper(coalesce(v_equipment.equipment_type, ''))
             LIKE '%DUMP%'
          OR upper(coalesce(v_equipment.equipment_type, ''))
             LIKE '%TRACTOR HEAD%'
          THEN 'ODOMETER'
        ELSE 'HOUR METER'
      END;
  END IF;


  v_meter_unit :=
    CASE
      WHEN v_meter_type = 'ODOMETER'
        THEN 'KM'
      ELSE 'HRS'
    END;


  IF p_meter_in IS NULL OR p_meter_in < 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Meter In must be zero or greater.'
    );
  END IF;


  v_master_meter :=
    coalesce(
      v_equipment.current_meter_reading,
      0
    );


  IF p_meter_in < v_master_meter THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',
      'Meter In cannot be lower than the current equipment master reading (' ||
      v_master_meter::text ||
      ').'
    );
  END IF;


  IF p_project_id IS NOT NULL
     AND btrim(p_project_id) <> '' THEN

    SELECT *
    INTO v_project
    FROM public.projects
    WHERE project_id::text = p_project_id::text
      AND upper(coalesce(status, '')) = 'ACTIVE'
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'The selected project is not active or was not found.'
      );
    END IF;

  ELSE

    IF nullif(
      btrim(
        coalesce(
          p_project_name,
          ''
        )
      ),
      ''
    ) IS NULL THEN

      RETURN jsonb_build_object(
        'success', false,
        'error', 'Project / location is required.'
      );

    END IF;

  END IF;


  IF EXISTS (
    SELECT 1
    FROM public.attendance
    WHERE employee_id::text = p_employee_id::text
      AND upper(coalesce(status, '')) = 'IN'
  ) THEN

    RETURN jsonb_build_object(
      'success', false,
      'error', 'This employee already has an active TIME IN.'
    );

  END IF;


  INSERT INTO public.attendance (
    employee_id,
    employee_name,
    attendance_date,
    time_in,
    time_out,
    total_hours,
    status,
    equipment_id,
    equipment_name,
    project_id,
    project_name,
    meter_type,
    meter_in,
    meter_out,
    meter_used,
    meter_unit,
    fuel_used,
    fuel_quantity,
    fuel_unit,
    fuel_amount
  )
  VALUES (
    p_employee_id,
    v_employee.employee_name,
    coalesce(
      p_attendance_date,
      (now() AT TIME ZONE 'Asia/Manila')::date
    ),
    coalesce(
      p_time_in,
      now()
    ),
    NULL,
    NULL,
    'IN',
    p_equipment_id,
    v_equipment.equipment_name,
    CASE
      WHEN p_project_id IS NULL
        OR btrim(p_project_id) = ''
        THEN NULL
      ELSE p_project_id
    END,
    btrim(p_project_name),
    v_meter_type,
    p_meter_in,
    NULL,
    NULL,
    v_meter_unit,
    false,
    NULL,
    NULL,
    NULL
  )
  RETURNING *
  INTO v_attendance;


  RETURN jsonb_build_object(
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


EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;


REVOKE ALL
  ON FUNCTION public.record_attendance_time_in(
    text,
    text,
    date,
    timestamptz,
    text,
    text,
    text,
    text,
    text,
    numeric,
    text
  )
  FROM PUBLIC;


GRANT EXECUTE
  ON FUNCTION public.record_attendance_time_in(
    text,
    text,
    date,
    timestamptz,
    text,
    text,
    text,
    text,
    text,
    numeric,
    text
  )
  TO anon, authenticated;
