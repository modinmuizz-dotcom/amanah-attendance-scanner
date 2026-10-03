-- AMANAH: unlimited additional driver/operator activity evidence photos.
-- The existing two photo slots remain unchanged. This table stores any additional photos.

begin;

create table if not exists public.activity_evidence_photos (
  evidence_id uuid primary key default gen_random_uuid(),
  attendance_id text not null
    references public.attendance(attendance_id)
    on delete cascade,
  project_activity_id uuid not null
    references public.project_activities(activity_id)
    on delete cascade,
  employee_id text not null
    references public.employees(employee_id)
    on delete restrict,
  photo_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_evidence_photos_activity
  on public.activity_evidence_photos(project_activity_id, created_at desc);

create index if not exists idx_activity_evidence_photos_attendance
  on public.activity_evidence_photos(attendance_id, created_at desc);

alter table public.activity_evidence_photos enable row level security;

revoke all on public.activity_evidence_photos from anon;
grant select, insert on public.activity_evidence_photos to authenticated;

drop policy if exists amanah_activity_evidence_mobile_select_own
  on public.activity_evidence_photos;

create policy amanah_activity_evidence_mobile_select_own
on public.activity_evidence_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_auth_accounts ea
    where ea.auth_user_id = (select auth.uid())
      and ea.mobile_access_enabled = true
      and ea.employee_id = activity_evidence_photos.employee_id
  )
);

drop policy if exists amanah_activity_evidence_mobile_insert_own
  on public.activity_evidence_photos;

create policy amanah_activity_evidence_mobile_insert_own
on public.activity_evidence_photos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_auth_accounts ea
    where ea.auth_user_id = (select auth.uid())
      and ea.mobile_access_enabled = true
      and ea.employee_id = activity_evidence_photos.employee_id
  )
  and exists (
    select 1
    from public.attendance a
    where a.attendance_id = activity_evidence_photos.attendance_id
      and a.employee_id = activity_evidence_photos.employee_id
      and a.project_activity_id = activity_evidence_photos.project_activity_id
  )
);

drop policy if exists amanah_activity_evidence_management_read
  on public.activity_evidence_photos;

create policy amanah_activity_evidence_management_read
on public.activity_evidence_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.amanah_user_roles ur
    join public.amanah_roles r on r.role_id = ur.role_id
    where ur.auth_user_id = (select auth.uid())
      and upper(r.role_name) in (
        'SUPER ADMIN',
        'PROJECT MANAGEMENT',
        'SITE ENGINEER',
        'ADMINISTRATOR',
        'OPERATIONS'
      )
  )
);

commit;