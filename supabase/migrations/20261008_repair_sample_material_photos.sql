alter table public.purchase_requests
  add column if not exists source_repair_request_id uuid;

alter table public.purchase_request_items
  add column if not exists sample_material_photo_paths text[];