-- AMANAH PROJECT TYPE ARCHITECTURE
-- Adds project-type classification and type-specific engineering details
-- while preserving all existing project records.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type text;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_projects_project_type
  ON public.projects(project_type);

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_type_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_type_check
  CHECK (
    project_type IS NULL OR project_type IN (
      'CONCRETING OF ROAD',
      'MULTI PURPOSE BUILDING',
      'SCHOOL BUILDING',
      'FLOOD CONTROL',
      'WATER SYSTEM',
      'BRIDGE',
      'COVERED COURT'
    )
  );

COMMENT ON COLUMN public.projects.project_type IS
  'AMANAH project classification used to determine the project-specific form.';

COMMENT ON COLUMN public.projects.project_details IS
  'JSONB container for engineering dimensions and calculated values specific to project_type.';
