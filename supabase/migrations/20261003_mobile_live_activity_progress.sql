-- Live field activity progress for the AMANAH driver/operator mobile app.
-- The engineer's project_activities row remains the source of truth for activity type/details.
-- The operator updates only actual quantity and photo evidence during the shift.

alter table public.attendance_activities
  add column if not exists project_activity_id uuid
    references public.project_activities(activity_id)
    on delete set null;

create index if not exists idx_attendance_activities_project_activity
  on public.attendance_activities(project_activity_id);

create unique index if not exists uq_attendance_activity_progress
  on public.attendance_activities(attendance_id, project_activity_id)
  where project_activity_id is not null;

create or replace function public.save_mobile_activity_progress(
  p_attendance_id text,
  p_employee_id text,
  p_project_activity_id uuid,
  p_quantity numeric,
  p_photo_1_path text default null,
  p_photo_2_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  rec public.attendance%rowtype;
  act public.project_activities%rowtype;
  existing public.attendance_activities%rowtype;
begin
  select * into rec
  from public.attendance
  where attendance_id = p_attendance_id
    and employee_id = p_employee_id
    and upper(coalesce(status,'')) = 'IN'
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Active attendance was not found.');
  end if;

  if rec.project_activity_id is null or rec.project_activity_id <> p_project_activity_id then
    return jsonb_build_object('success', false, 'error', 'The activity is not the activity assigned to this active attendance.');
  end if;

  if p_quantity is null or p_quantity < 0 then
    return jsonb_build_object('success', false, 'error', 'Accomplishment quantity must be zero or greater.');
  end if;

  select * into act
  from public.project_activities
  where activity_id = p_project_activity_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Engineer-assigned activity was not found.');
  end if;

  select * into existing
  from public.attendance_activities
  where attendance_id = p_attendance_id
    and project_activity_id = p_project_activity_id
  order by id desc
  limit 1;

  if found then
    update public.attendance_activities
    set quantity = p_quantity,
        photo_1_path = coalesce(nullif(btrim(p_photo_1_path), ''), photo_1_path),
        photo_2_path = coalesce(nullif(btrim(p_photo_2_path), ''), photo_2_path)
    where id = existing.id
    returning * into existing;
  else
    insert into public.attendance_activities (
      attendance_id,
      project_activity_id,
      activity_category,
      activity_description,
      quantity,
      photo_1_path,
      photo_2_path
    )
    values (
      p_attendance_id,
      p_project_activity_id,
      btrim(act.activity),
      coalesce(
        nullif(btrim(act.activity_item), ''),
        nullif(btrim(act.description), ''),
        btrim(act.activity)
      ),
      p_quantity,
      nullif(btrim(p_photo_1_path), ''),
      nullif(btrim(p_photo_2_path), '')
    )
    returning * into existing;
  end if;

  return jsonb_build_object(
    'success', true,
    'attendance_id', existing.attendance_id,
    'project_activity_id', existing.project_activity_id,
    'activity_category', existing.activity_category,
    'activity_description', existing.activity_description,
    'quantity', existing.quantity,
    'photo_1_path', existing.photo_1_path,
    'photo_2_path', existing.photo_2_path
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

create or replace function public.get_mobile_active_activity(
  p_attendance_id text,
  p_employee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  rec public.attendance%rowtype;
  act public.project_activities%rowtype;
  prog public.attendance_activities%rowtype;
begin
  select * into rec
  from public.attendance
  where attendance_id = p_attendance_id
    and employee_id = p_employee_id
    and upper(coalesce(status,'')) = 'IN'
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Active attendance was not found.');
  end if;

  if rec.project_activity_id is null then
    return jsonb_build_object('success', false, 'error', 'No engineer-assigned activity is linked to this attendance.');
  end if;

  select * into act
  from public.project_activities
  where activity_id = rec.project_activity_id
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Engineer-assigned activity was not found.');
  end if;

  select * into prog
  from public.attendance_activities
  where attendance_id = rec.attendance_id
    and project_activity_id = rec.project_activity_id
  order by id desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'attendance_id', rec.attendance_id,
    'project_activity_id', rec.project_activity_id,
    'equipment_id', rec.equipment_id,
    'equipment_name', rec.equipment_name,
    'project_id', rec.project_id,
    'project_name', rec.project_name,
    'activity', act.activity,
    'activity_item', act.activity_item,
    'description', act.description,
    'planned_quantity', act.activity_quantity,
    'actual_quantity', coalesce(prog.quantity, 0),
    'photo_1_path', prog.photo_1_path,
    'photo_2_path', prog.photo_2_path
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$function$;

revoke all on function public.save_mobile_activity_progress(text,text,uuid,numeric,text,text) from public, anon;
revoke all on function public.get_mobile_active_activity(text,text) from public, anon;
grant execute on function public.save_mobile_activity_progress(text,text,uuid,numeric,text,text) to authenticated;
grant execute on function public.get_mobile_active_activity(text,text) to authenticated;
