/*
  AMANAH ATTENDANCE FUEL PHOTO EVIDENCE
  --------------------------------------
  Optional: when TIME OUT -> YES, FUELED
  the operator may attach one photo.

  This migration adds:
    - attendance.fuel_photo_path
    - private storage bucket
    - storage upload/read policies
    - secure attach_fuel_evidence RPC

  Run after the existing attendance migrations.
*/


/* ==========================================================
   1. ATTENDANCE FIELD
   ========================================================== */

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS fuel_photo_path text;


/* ==========================================================
   2. PRIVATE STORAGE BUCKET
   ========================================================== */

INSERT INTO storage.buckets (
  id,
  name,
  public
)
VALUES (
  'attendance-fuel-evidence',
  'attendance-fuel-evidence',
  false
)
ON CONFLICT (id)
DO UPDATE
SET public = false;


/* ==========================================================
   3. STORAGE INSERT POLICY
   ========================================================== */

DROP POLICY IF EXISTS
  "attendance fuel evidence upload"
ON storage.objects;

CREATE POLICY
  "attendance fuel evidence upload"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id =
    'attendance-fuel-evidence'

  AND name LIKE
    'attendance/%'

  AND coalesce(
    (metadata->>'size')::bigint,
    0
  ) <= 10485760
);


/* ==========================================================
   4. STORAGE READ POLICY
   ========================================================== */

DROP POLICY IF EXISTS
  "attendance fuel evidence authenticated read"
ON storage.objects;

CREATE POLICY
  "attendance fuel evidence authenticated read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id =
    'attendance-fuel-evidence'
);


/* ==========================================================
   5. SECURE ATTACH FUNCTION
   ========================================================== */

CREATE OR REPLACE FUNCTION public.attach_fuel_evidence(
  p_attendance_id text,
  p_employee_id text,
  p_photo_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$

DECLARE
  rec public.attendance%ROWTYPE;
  v_prefix text;
BEGIN

  IF nullif(
    btrim(p_photo_path),
    ''
  ) IS NULL THEN

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Fuel photo path is required.'
    );

  END IF;


  v_prefix :=
    'attendance/' ||
    p_attendance_id ||
    '/';


  IF left(
    p_photo_path,
    length(v_prefix)
  ) <> v_prefix THEN

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Fuel photo does not belong to this attendance.'
    );

  END IF;


  SELECT *
  INTO rec
  FROM public.attendance
  WHERE attendance_id::text =
        p_attendance_id
    AND employee_id::text =
        p_employee_id
    AND upper(
      coalesce(
        status,
        ''
      )
    ) = 'COMPLETED'
  LIMIT 1;


  IF NOT FOUND THEN

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Completed attendance was not found.'
    );

  END IF;


  UPDATE public.attendance
  SET
    fuel_photo_path =
      p_photo_path
  WHERE attendance_id::text =
        p_attendance_id
    AND employee_id::text =
        p_employee_id;


  RETURN jsonb_build_object(
    'success', true,
    'attendance_id',
      rec.attendance_id,
    'fuel_photo_path',
      p_photo_path
  );


EXCEPTION
  WHEN others THEN

    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );

END;
$function$;


/* ==========================================================
   6. FUNCTION PERMISSIONS
   ========================================================== */

REVOKE ALL
  ON FUNCTION public.attach_fuel_evidence(
    text,
    text,
    text
  )
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.attach_fuel_evidence(
    text,
    text,
    text
  )
  TO anon, authenticated;
