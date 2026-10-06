alter table public.amanah_approval_requests
  drop constraint if exists amanah_approval_requests_request_type_check;

alter table public.amanah_approval_requests
  add constraint amanah_approval_requests_request_type_check
  check (request_type = any (array['ACTIVITY','PURCHASE_REQUEST','MAINTENANCE','MATERIAL_PICKUP']::text[]));