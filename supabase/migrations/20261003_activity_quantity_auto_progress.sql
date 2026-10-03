-- Automatically calculate engineer-visible activity progress from field accomplishment quantity.
-- project_activities.accomplishment remains the percentage field for existing reports/UI.
-- attendance_activities.quantity is the field operators update from the mobile app.

create or replace function public.sync_project_activity_quantity_progress(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_planned numeric;
  v_actual numeric;
  v_progress numeric;
  v_status text;
  v_current_status text;
begin
  if p_activity_id is null then
    return;
  end if;

  select activity_quantity, upper(coalesce(activity_status, 'PLANNED'))
    into v_planned, v_current_status
  from public.project_activities
  where activity_id = p_activity_id;

  if not found then
    return;
  end if;

  select coalesce(sum(quantity), 0)
    into v_actual
  from public.attendance_activities
  where project_activity_id = p_activity_id;

  v_planned := coalesce(v_planned, 0);

  if v_planned > 0 then
    v_progress := round(least(100, greatest(0, (v_actual / v_planned) * 100)), 2);
  else
    v_progress := 0;
  end if;

  if v_current_status in ('CANCELLED', 'NOT DONE') and v_actual = 0 then
    v_status := v_current_status;
  elsif v_progress >= 100 and v_planned > 0 then
    v_status := 'DONE';
  elsif v_actual > 0 then
    v_status := 'IN PROGRESS';
  else
    v_status := 'PLANNED';
  end if;

  update public.project_activities
  set accomplishment = v_progress,
      activity_status = v_status,
      completed_at = case when v_progress >= 100 and v_planned > 0 then coalesce(completed_at, now()) else null end,
      updated_at = now()
  where activity_id = p_activity_id;
end;
$function$;

create or replace function public.trg_sync_project_activity_quantity_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.sync_project_activity_quantity_progress(old.project_activity_id);
  elsif tg_op = 'UPDATE' then
    perform public.sync_project_activity_quantity_progress(old.project_activity_id);
    if new.project_activity_id is distinct from old.project_activity_id then
      perform public.sync_project_activity_quantity_progress(new.project_activity_id);
    end if;
  else
    perform public.sync_project_activity_quantity_progress(new.project_activity_id);
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_attendance_activities_quantity_progress
on public.attendance_activities;

create trigger trg_attendance_activities_quantity_progress
after insert or update of project_activity_id, quantity or delete
on public.attendance_activities
for each row
execute function public.trg_sync_project_activity_quantity_progress();

create or replace function public.trg_sync_project_activity_planned_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.sync_project_activity_quantity_progress(new.activity_id);
  return new;
end;
$function$;

drop trigger if exists trg_project_activity_planned_quantity_progress
on public.project_activities;

create trigger trg_project_activity_planned_quantity_progress
after insert or update of activity_quantity
on public.project_activities
for each row
execute function public.trg_sync_project_activity_planned_quantity();

do $block$
declare
  r record;
begin
  for r in select activity_id from public.project_activities loop
    perform public.sync_project_activity_quantity_progress(r.activity_id);
  end loop;
end;
$block$;
