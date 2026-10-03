create policy "amanah_mobile_employee_select_own"
on public.employees
for select
to authenticated
using (
  employee_id in (
    select ea.employee_id
    from public.employee_auth_accounts ea
    where ea.auth_user_id = (select auth.uid())
      and ea.mobile_access_enabled = true
  )
);

comment on policy "amanah_mobile_employee_select_own" on public.employees
is 'Allows authenticated AMANAH mobile users to read only their own linked active employee profile.';
