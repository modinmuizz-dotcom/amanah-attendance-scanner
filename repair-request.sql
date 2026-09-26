-- =========================================================
-- AMANAH REPAIR REQUEST + PHOTO EVIDENCE
-- Reviewer / Approver workflow
-- =========================================================

create sequence if not exists public.repair_request_no_seq;

create table if not exists public.repair_requests (
  repair_request_id uuid primary key default gen_random_uuid(),

  repair_form_no text not null unique default (
    'RR-' ||
    to_char(current_date, 'YYYY') ||
    '-' ||
    lpad(nextval('public.repair_request_no_seq')::text, 6, '0')
  ),

  request_date date not null default current_date,

  equipment_id text not null
    references public.equipment(equipment_id)
    on update cascade
    on delete restrict,

  project_id text null
    references public.projects(project_id)
    on update cascade
    on delete set null,

  pm_inspection_ref text null,
  reported_by text not null,

  body_plate_no text null,

  problems_encountered text not null,

  status text not null default 'DRAFT'
    check (
      status in (
        'DRAFT',
        'PENDING REVIEW',
        'PENDING APPROVAL',
        'APPROVED',
        'RETURNED',
        'IN PROGRESS',
        'COMPLETED',
        'CLOSED'
      )
    ),

  prepared_by uuid null references auth.users(id) default auth.uid(),
  prepared_at timestamptz null,

  reviewed_by uuid null references auth.users(id),
  reviewed_at timestamptz null,
  reviewer_notes text null,
  reviewer_evidence_reviewed boolean not null default false,

  approved_by uuid null references auth.users(id),
  approved_at timestamptz null,
  approver_notes text null,
  approver_evidence_reviewed boolean not null default false,

  remarks text null,

  repaired_by text null,
  repair_date_started timestamptz null,
  repair_date_completed timestamptz null,

  received_in_good_condition_by text null,
  received_position text null,
  received_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_repair_requests_equipment
  on public.repair_requests(equipment_id);

create index if not exists idx_repair_requests_project
  on public.repair_requests(project_id);

create index if not exists idx_repair_requests_status
  on public.repair_requests(status);

create index if not exists idx_repair_requests_date
  on public.repair_requests(request_date desc);


create table if not exists public.repair_request_items (
  repair_item_id uuid primary key default gen_random_uuid(),

  repair_request_id uuid not null
    references public.repair_requests(repair_request_id)
    on delete cascade,

  work_to_be_done text null,
  material_or_spare_part text null,

  quantity numeric(15,3) null
    check (quantity is null or quantity >= 0),

  unit text null,

  unit_cost numeric(15,2) null
    check (unit_cost is null or unit_cost >= 0),

  total_cost numeric(15,2)
    generated always as (
      round(
        coalesce(quantity,0) *
        coalesce(unit_cost,0),
        2
      )
    ) stored,

  display_order integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists idx_repair_request_items_request
  on public.repair_request_items(repair_request_id);


create table if not exists public.repair_request_photos (
  photo_id uuid primary key default gen_random_uuid(),

  repair_request_id uuid not null
    references public.repair_requests(repair_request_id)
    on delete cascade,

  pm_inspection_item_id uuid null,

  photo_category text not null
    check (
      photo_category in (
        'PM FINDING',
        'REPAIR BEFORE',
        'REPAIR DURING',
        'REPAIR AFTER',
        'PART / DAMAGE EVIDENCE',
        'OTHER'
      )
    ),

  file_path text not null,
  file_name text not null,
  caption text null,

  uploaded_by uuid null references auth.users(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_repair_request_photos_request
  on public.repair_request_photos(repair_request_id);


-- =========================================================
-- UPDATED_AT
-- =========================================================

create or replace function
public.set_repair_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists
trg_repair_request_updated_at
on public.repair_requests;

create trigger
trg_repair_request_updated_at
before update on public.repair_requests
for each row
execute function public.set_repair_request_updated_at();


-- =========================================================
-- RLS
-- =========================================================

alter table public.repair_requests enable row level security;
alter table public.repair_request_items enable row level security;
alter table public.repair_request_photos enable row level security;

drop policy if exists "authenticated users can read repair requests"
on public.repair_requests;

drop policy if exists "authenticated users can insert repair requests"
on public.repair_requests;

drop policy if exists "authenticated users can update repair requests"
on public.repair_requests;

drop policy if exists "authenticated users can delete repair requests"
on public.repair_requests;

create policy "authenticated users can read repair requests"
on public.repair_requests
for select to authenticated
using (true);

create policy "authenticated users can insert repair requests"
on public.repair_requests
for insert to authenticated
with check (auth.uid() is not null);

create policy "authenticated users can update repair requests"
on public.repair_requests
for update to authenticated
using (true)
with check (auth.uid() is not null);

create policy "authenticated users can delete repair requests"
on public.repair_requests
for delete to authenticated
using (true);


drop policy if exists "authenticated users can read repair items"
on public.repair_request_items;

drop policy if exists "authenticated users can insert repair items"
on public.repair_request_items;

drop policy if exists "authenticated users can update repair items"
on public.repair_request_items;

drop policy if exists "authenticated users can delete repair items"
on public.repair_request_items;

create policy "authenticated users can read repair items"
on public.repair_request_items
for select to authenticated
using (true);

create policy "authenticated users can insert repair items"
on public.repair_request_items
for insert to authenticated
with check (auth.uid() is not null);

create policy "authenticated users can update repair items"
on public.repair_request_items
for update to authenticated
using (true)
with check (auth.uid() is not null);

create policy "authenticated users can delete repair items"
on public.repair_request_items
for delete to authenticated
using (true);


drop policy if exists "authenticated users can read repair photos"
on public.repair_request_photos;

drop policy if exists "authenticated users can insert repair photos"
on public.repair_request_photos;

drop policy if exists "authenticated users can update repair photos"
on public.repair_request_photos;

drop policy if exists "authenticated users can delete repair photos"
on public.repair_request_photos;

create policy "authenticated users can read repair photos"
on public.repair_request_photos
for select to authenticated
using (true);

create policy "authenticated users can insert repair photos"
on public.repair_request_photos
for insert to authenticated
with check (auth.uid() is not null);

create policy "authenticated users can update repair photos"
on public.repair_request_photos
for update to authenticated
using (true)
with check (auth.uid() is not null);

create policy "authenticated users can delete repair photos"
on public.repair_request_photos
for delete to authenticated
using (true);


-- =========================================================
-- PRIVATE SUPABASE STORAGE BUCKET
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public
)
values (
  'repair-evidence',
  'repair-evidence',
  false
)
on conflict (id)
do update set public = false;


drop policy if exists "authenticated users can view repair evidence"
on storage.objects;

drop policy if exists "authenticated users can upload repair evidence"
on storage.objects;

drop policy if exists "authenticated users can update repair evidence"
on storage.objects;

drop policy if exists "authenticated users can delete repair evidence"
on storage.objects;


create policy "authenticated users can view repair evidence"
on storage.objects
for select to authenticated
using (
  bucket_id = 'repair-evidence'
);


create policy "authenticated users can upload repair evidence"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'repair-evidence'
);


create policy "authenticated users can update repair evidence"
on storage.objects
for update to authenticated
using (
  bucket_id = 'repair-evidence'
)
with check (
  bucket_id = 'repair-evidence'
);


create policy "authenticated users can delete repair evidence"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'repair-evidence'
);


-- =========================================================
-- OPTIONAL HELPER VIEW
-- =========================================================

create or replace view public.repair_request_summary
with (security_invoker = true)
as
select
  r.repair_request_id,
  r.repair_form_no,
  r.request_date,
  r.created_at,
  r.updated_at,
  r.equipment_id,
  e.equipment_name,
  e.equipment_type,
  e.plate_number,
  r.project_id,
  p.project_name,
  r.reported_by,
  r.status,
  r.problems_encountered,
  r.reviewer_evidence_reviewed,
  r.approver_evidence_reviewed,
  r.prepared_at,
  r.reviewed_at,
  r.approved_at,
  r.repair_date_started,
  r.repair_date_completed,
  (
    select count(*)
    from public.repair_request_photos ph
    where ph.repair_request_id = r.repair_request_id
  ) as photo_count
from public.repair_requests r
left join public.equipment e
  on e.equipment_id = r.equipment_id
left join public.projects p
  on p.project_id = r.project_id;
