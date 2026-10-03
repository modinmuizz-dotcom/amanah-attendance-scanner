begin;

create or replace function public.get_project_activity_equipment_progress(
  p_activity_id uuid
)
returns table(
  equipment_id text,
  equipment_name text,
  plate_number text,
  actual_quantity numeric,
  attendance_count integer
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (
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
  ) then
    raise exception 'Not authorized to view activity equipment progress.';
  end if;

  return query
  select
    pae.equipment_id,
    coalesce(e.equipment_name, 'Unknown Equipment') as equipment_name,
    e.plate_number,
    round(coalesce(sum(aa.quantity), 0), 2) as actual_quantity,
    count(distinct a.attendance_id)::integer as attendance_count
  from public.project_activity_equipment pae
  left join public.equipment e
    on e.equipment_id = pae.equipment_id
  left join public.attendance a
    on a.project_activity_id = p_activity_id
   and a.equipment_id = pae.equipment_id
  left join public.attendance_activities aa
    on aa.attendance_id = a.attendance_id
   and aa.project_activity_id = p_activity_id
  where pae.activity_id = p_activity_id
  group by pae.equipment_id, e.equipment_name, e.plate_number
  order by coalesce(e.equipment_name, 'Unknown Equipment');
end;
$function$;

grant execute on function public.get_project_activity_equipment_progress(uuid)
  to authenticated;

commit;