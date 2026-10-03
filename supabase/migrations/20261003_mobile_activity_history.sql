begin;

create or replace function public.get_mobile_activity_history(
  p_employee_id text,
  p_limit integer default 50
)
returns table(
  attendance_id text,
  attendance_date date,
  time_in timestamptz,
  time_out timestamptz,
  total_hours numeric,
  equipment_id text,
  equipment_name text,
  project_id text,
  project_name text,
  activity_id uuid,
  activity_category text,
  activity_description text,
  planned_quantity numeric,
  actual_quantity numeric,
  activity_status text,
  activity_approval_status text,
  meter_type text,
  meter_in numeric,
  meter_out numeric,
  meter_used numeric,
  meter_unit text,
  fuel_used boolean,
  fuel_quantity numeric,
  fuel_unit text,
  fuel_amount numeric,
  fuel_photo_path text,
  photo_1_path text,
  photo_2_path text,
  additional_photo_count integer
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (
    select 1
    from public.employee_auth_accounts eaa
    where eaa.employee_id::text = p_employee_id::text
      and eaa.auth_user_id = auth.uid()
      and eaa.mobile_access_enabled = true
  ) then
    raise exception 'Mobile history access is not enabled for this employee.';
  end if;

  return query
  select
    a.attendance_id,
    a.attendance_date,
    a.time_in,
    a.time_out,
    a.total_hours,
    a.equipment_id,
    a.equipment_name,
    a.project_id,
    a.project_name,
    aa.project_activity_id,
    aa.activity_category,
    aa.activity_description,
    pa.activity_quantity as planned_quantity,
    aa.quantity as actual_quantity,
    pa.activity_status,
    pa.approval_status as activity_approval_status,
    a.meter_type,
    a.meter_in,
    a.meter_out,
    a.meter_used,
    a.meter_unit,
    a.fuel_used,
    a.fuel_quantity,
    a.fuel_unit,
    a.fuel_amount,
    a.fuel_photo_path,
    aa.photo_1_path,
    aa.photo_2_path,
    coalesce((
      select count(*)::integer
      from public.activity_evidence_photos ep
      where ep.attendance_id = a.attendance_id
        and ep.project_activity_id = aa.project_activity_id
    ), 0) as additional_photo_count
  from public.attendance a
  join public.attendance_activities aa
    on aa.attendance_id = a.attendance_id
  left join public.project_activities pa
    on pa.activity_id = aa.project_activity_id
  where a.employee_id::text = p_employee_id::text
    and upper(coalesce(a.status, '')) <> 'IN'
  order by coalesce(a.time_out, a.time_in, a.created_at) desc,
           aa.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);

end;
$function$;

grant execute on function public.get_mobile_activity_history(text, integer) to authenticated;

commit;