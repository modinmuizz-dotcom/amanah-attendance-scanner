-- AMANAH: allow driver/operator to replace their own additional activity evidence photo.

begin;

grant update on public.activity_evidence_photos to authenticated;

drop policy if exists amanah_activity_evidence_mobile_update_own
  on public.activity_evidence_photos;

create policy amanah_activity_evidence_mobile_update_own
on public.activity_evidence_photos
for update
to authenticated
using (
  exists (
    select 1
    from public.employee_auth_accounts ea
    where ea.auth_user_id = (select auth.uid())
      and ea.mobile_access_enabled = true
      and ea.employee_id = activity_evidence_photos.employee_id
  )
)
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

commit;