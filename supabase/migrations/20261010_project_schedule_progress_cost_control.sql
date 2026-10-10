-- Project Cost Control: derive physical progress from the new approved activity schedule.
-- Operator/driver submissions in attendance_activities are the only source of actual quantity.
-- Each eligible activity contributes one capped completion percentage so unlike units
-- (loads, m3, trips, etc.) are not incorrectly added together.
-- No values are read from the legacy manually entered projects.current_progress.

create or replace function public.get_project_schedule_progress(p_project_id text)
returns table (
  progress_percent numeric,
  activity_count integer,
  completed_activities integer,
  in_progress_activities integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with eligible as (
    select
      pa.activity_id,
      pa.activity_quantity::numeric as planned,
      greatest(
        coalesce((
          select sum(greatest(coalesce(aa.quantity, 0), 0))
          from public.attendance_activities aa
          where aa.project_activity_id = pa.activity_id
        ), 0),
        0
      ) as actual
    from public.project_activities pa
    where pa.project_id = p_project_id
      and pa.approval_status = 'APPROVED'
      and upper(coalesce(pa.activity_status, '')) not in (
        'CANCELLED', 'NOT DONE', 'REJECTED', 'PENDING APPROVAL'
      )
      and pa.activity_quantity > 0
      and (select auth.uid()) is not null
  ),
  ratios as (
    select least(100::numeric, greatest(0::numeric, actual * 100 / planned)) as pct
    from eligible
  )
  select
    round(avg(pct), 2) as progress_percent,
    count(*)::integer as activity_count,
    count(*) filter (where pct >= 100)::integer as completed_activities,
    count(*) filter (where pct > 0 and pct < 100)::integer as in_progress_activities
  from ratios;
$function$;

revoke all on function public.get_project_schedule_progress(text) from public, anon;
grant execute on function public.get_project_schedule_progress(text) to authenticated;

comment on function public.get_project_schedule_progress(text) is
  'Average approved activity completion, calculated only from field-reported actual quantity / engineer-planned quantity; not the legacy manual project percent.';
