alter table public.project_activities
  add column if not exists activity_item text,
  add column if not exists activity_quantity numeric;
