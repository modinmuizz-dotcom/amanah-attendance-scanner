/*
  AMANAH EQUIPMENT MAINTENANCE PHOTO EVIDENCE
  --------------------------------------------
  Adds photo attachments to maintenance records.
*/

CREATE TABLE IF NOT EXISTS public.equipment_maintenance_photos (
  photo_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_id text NOT NULL,
  storage_path text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_photos_maintenance
  ON public.equipment_maintenance_photos (maintenance_id);

ALTER TABLE public.equipment_maintenance_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "maintenance photos authenticated select"
  ON public.equipment_maintenance_photos;
CREATE POLICY "maintenance photos authenticated select"
  ON public.equipment_maintenance_photos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "maintenance photos authenticated insert"
  ON public.equipment_maintenance_photos;
CREATE POLICY "maintenance photos authenticated insert"
  ON public.equipment_maintenance_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "maintenance photos authenticated delete"
  ON public.equipment_maintenance_photos;
CREATE POLICY "maintenance photos authenticated delete"
  ON public.equipment_maintenance_photos
  FOR DELETE
  TO authenticated
  USING (true);


/* Private Storage bucket */
INSERT INTO storage.buckets (id, name, public)
VALUES (
  'equipment-maintenance-evidence',
  'equipment-maintenance-evidence',
  false
)
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  public = false;


/* Storage permissions */
DROP POLICY IF EXISTS "maintenance evidence authenticated upload"
  ON storage.objects;
CREATE POLICY "maintenance evidence authenticated upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'equipment-maintenance-evidence'
    AND name LIKE 'maintenance/%'
  );

DROP POLICY IF EXISTS "maintenance evidence authenticated read"
  ON storage.objects;
CREATE POLICY "maintenance evidence authenticated read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'equipment-maintenance-evidence'
  );

DROP POLICY IF EXISTS "maintenance evidence authenticated delete"
  ON storage.objects;
CREATE POLICY "maintenance evidence authenticated delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'equipment-maintenance-evidence'
  );

SELECT
  photo_id,
  maintenance_id,
  storage_path,
  created_at
FROM public.equipment_maintenance_photos
ORDER BY created_at DESC
LIMIT 5;
