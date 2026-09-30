create or replace function public.amanah_delete_attendance(p_attendance_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.amanah_user_roles ur
    join public.amanah_roles r on r.role_id = ur.role_id
    where ur.auth_user_id = auth.uid()
      and upper(r.role_name) = 'SUPER ADMIN'
  ) then
    raise exception 'Only SUPER ADMIN can delete attendance records.';
  end if;

  delete from public.attendance
  where attendance_id = p_attendance_id;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'Attendance record not found.';
  end if;

  return true;
end;
$$;

grant execute on function public.amanah_delete_attendance(text) to authenticated;
