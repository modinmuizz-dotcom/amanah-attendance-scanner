-- AMANAH BOM / MATERIAL ESTIMATE
-- Stores project-specific material estimates without changing existing project records.

CREATE TABLE IF NOT EXISTS public.project_material_estimates (
  estimate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
  estimate_type text NOT NULL DEFAULT 'ROAD',
  basis_quantity numeric NOT NULL DEFAULT 0,
  basis_label text NOT NULL DEFAULT 'PAVEMENT AREA',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_material_estimates_project_type_unique
    UNIQUE (project_id, estimate_type)
);

CREATE TABLE IF NOT EXISTS public.project_material_estimate_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.project_material_estimates(estimate_id) ON DELETE CASCADE,
  description text NOT NULL,
  unit text NOT NULL,
  consumption_factor numeric NOT NULL DEFAULT 0,
  qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  formula text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_material_estimate_items_unique
    UNIQUE (estimate_id, description)
);

CREATE INDEX IF NOT EXISTS idx_project_material_estimates_project_id
  ON public.project_material_estimates(project_id);

CREATE INDEX IF NOT EXISTS idx_project_material_estimate_items_estimate_id
  ON public.project_material_estimate_items(estimate_id);

ALTER TABLE public.project_material_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_estimate_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_material_estimates_authenticated_select" ON public.project_material_estimates;
DROP POLICY IF EXISTS "project_material_estimates_authenticated_insert" ON public.project_material_estimates;
DROP POLICY IF EXISTS "project_material_estimates_authenticated_update" ON public.project_material_estimates;
DROP POLICY IF EXISTS "project_material_estimates_authenticated_delete" ON public.project_material_estimates;

CREATE POLICY "project_material_estimates_authenticated_select"
ON public.project_material_estimates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "project_material_estimates_authenticated_insert"
ON public.project_material_estimates FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "project_material_estimates_authenticated_update"
ON public.project_material_estimates FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "project_material_estimates_authenticated_delete"
ON public.project_material_estimates FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "project_material_estimate_items_authenticated_select" ON public.project_material_estimate_items;
DROP POLICY IF EXISTS "project_material_estimate_items_authenticated_insert" ON public.project_material_estimate_items;
DROP POLICY IF EXISTS "project_material_estimate_items_authenticated_update" ON public.project_material_estimate_items;
DROP POLICY IF EXISTS "project_material_estimate_items_authenticated_delete" ON public.project_material_estimate_items;

CREATE POLICY "project_material_estimate_items_authenticated_select"
ON public.project_material_estimate_items FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "project_material_estimate_items_authenticated_insert"
ON public.project_material_estimate_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "project_material_estimate_items_authenticated_update"
ON public.project_material_estimate_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "project_material_estimate_items_authenticated_delete"
ON public.project_material_estimate_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
