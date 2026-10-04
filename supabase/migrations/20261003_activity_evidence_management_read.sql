-- Allow AMANAH management roles to review field activity quantities and evidence.
-- Driver/operator users keep their own-row policy; this adds read-only visibility
-- for the Activity Calendar / management screens.
drop policy if exists amanah_management_activities_read on public.attendance_activities;

create policy amanah_management_activities_read
on public.attendance_activities
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
