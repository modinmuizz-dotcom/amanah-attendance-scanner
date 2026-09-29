-- AMANAH Activities on Site
-- Adds activity photo evidence persistence and updates TIME OUT RPC
-- to store the two activity evidence paths already uploaded by the scanner.

ALTER TABLE public.attendance_activities
  ADD COLUMN IF NOT EXISTS photo_1_path text,
  ADD COLUMN IF NOT EXISTS photo_2_path text;

CREATE OR REPLACE FUNCTION public.prepare_attendance_out(
  p_attendance_id text,
  p_employee_id text,
  p_meter_out numeric,
  p_activities jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  rec public.attendance%ROWTYPE;
  v_meter_type text;
  v_meter_unit text;
  v_meter_in numeric;
  v_meter_used numeric;
  v_activity jsonb;
  v_count integer := 0;
BEGIN
  SELECT *
  INTO rec
  FROM public.attendance
  WHERE attendance_id::text = p_attendance_id
    AND employee_id::text = p_employee_id
    AND upper(coalesce(status, '')) = 'IN'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No active attendance was found for this employee.'
    );
  END IF;

  v_meter_type :=
    upper(
      btrim(
        coalesce(
          rec.meter_type,
          'HOUR METER'
        )
      )
    );

  IF v_meter_type NOT IN ('ODOMETER', 'HOUR METER') THEN
    v_meter_type := 'HOUR METER';
  END IF;

  v_meter_unit :=
    CASE
      WHEN v_meter_type = 'ODOMETER'
        THEN 'KM'
      ELSE 'HRS'
    END CASE;

  v_meter_in := rec.meter_in;

  IF v_meter_in IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This attendance record has no Meter In value. Please close the old attendance record before using the new workflow.'
    );
  END IF;

  IF p_meter_out IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Meter Out is required.'
    );
  END IF;

  IF p_meter_out < v_meter_in THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Meter Out cannot be lower than Meter In.'
    );
  END IF;

  IF jsonb_typeof(coalesce(p_activities, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Activity data must be an array.'
    );
  END IF;

  IF jsonb_array_length(coalesce(p_activities, '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'At least one activity is required.'
    );
  END IF;

  FOR v_activity IN
    SELECT value
    FROM jsonb_array_elements(p_activities)
  LOOP
    IF nullif(btrim(v_activity->>'activity_category'), '') IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Every activity needs a category.'
      );
    END IF;

    IF nullif(btrim(v_activity->>'activity_description'), '') IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Every activity needs a description.'
      );
    END IF;

    IF (v_activity->>'quantity')::numeric <= 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Every activity quantity must be greater than zero.'
      );
    END IF;
  END LOOP;

  v_meter_used :=
    round(
      (p_meter_out - v_meter_in)::numeric,
      2
    );

  UPDATE public.attendance
  SET
    meter_type = v_meter_type,
    meter_out = p_meter_out,
    meter_used = v_meter_used,
    meter_unit = v_meter_unit
  WHERE attendance_id::text = p_attendance_id
    AND employee_id::text = p_employee_id
    AND upper(coalesce(status, '')) = 'IN';

  IF rec.equipment_id IS NOT NULL THEN
    UPDATE public.equipment
    SET
      meter_type = v_meter_type,
      current_meter_reading =
        GREATEST(
          coalesce(current_meter_reading, 0),
          p_meter_out
        )
    WHERE equipment_id::text = rec.equipment_id::text;
  END IF;

  DELETE FROM public.attendance_activities
  WHERE attendance_id = rec.attendance_id::text;

  FOR v_activity IN
    SELECT value
    FROM jsonb_array_elements(p_activities)
  LOOP
    INSERT INTO public.attendance_activities (
      attendance_id,
      activity_category,
      activity_description,
      quantity,
      photo_1_path,
      photo_2_path
    )
    VALUES (
      rec.attendance_id::text,
      btrim(v_activity->>'activity_category'),
      btrim(v_activity->>'activity_description'),
      (v_activity->>'quantity')::numeric,
      nullif(btrim(v_activity->>'photo_1_path'), ''),
      nullif(btrim(v_activity->>'photo_2_path'), '')
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'attendance_id', rec.attendance_id::text,
    'meter_type', v_meter_type,
    'meter_unit', v_meter_unit,
    'meter_in', v_meter_in,
    'meter_out', p_meter_out,
    'meter_used', v_meter_used,
    'activity_count', v_count
  );

EXCEPTION
  WHEN others THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;