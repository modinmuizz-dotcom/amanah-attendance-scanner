/*
  AMANAH PHOTO STORAGE BUCKET REPAIR
  ----------------------------------
  Use this if the attendance station shows:
    "Bucket not found"

  This safely creates/repairs BOTH private buckets:
    attendance-activity-evidence
    attendance-fuel-evidence

  Run the whole script in Supabase SQL Editor.
*/


/* ==========================================================
   1. ACTIVITY PHOTO BUCKET
   ========================================================== */

INSERT INTO storage.buckets (
  id,
  name,
  public
)
VALUES (
  'attendance-activity-evidence',
  'attendance-activity-evidence',
  false
)
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  public = false;


/* ==========================================================
   2. FUEL PHOTO BUCKET
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
DO UPDATE SET
  name = EXCLUDED.name,
  public = false;


/* ==========================================================
   3. ACTIVITY UPLOAD POLICY
   ========================================================== */

DROP POLICY IF EXISTS
  "attendance activity evidence upload"
ON storage.objects;

CREATE POLICY
  "attendance activity evidence upload"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'attendance-activity-evidence'
  AND name LIKE 'attendance/%'
);


/* ==========================================================
   4. ACTIVITY READ POLICY
   ========================================================== */

DROP POLICY IF EXISTS
  "attendance activity evidence authenticated read"
ON storage.objects;

CREATE POLICY
  "attendance activity evidence authenticated read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'attendance-activity-evidence'
);


/* ==========================================================
   5. FUEL UPLOAD POLICY
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
  bucket_id = 'attendance-fuel-evidence'
  AND name LIKE 'attendance/%'
);


/* ==========================================================
   6. FUEL READ POLICY
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
  bucket_id = 'attendance-fuel-evidence'
);


/* ==========================================================
   7. VERIFY
   ========================================================== */

SELECT
  id,
  name,
  public
FROM storage.buckets
WHERE id IN (
  'attendance-activity-evidence',
  'attendance-fuel-evidence'
)
ORDER BY id;
