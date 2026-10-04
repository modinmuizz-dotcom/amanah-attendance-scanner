-- Extend mobile approved-work data with the universal project structure.
drop function if exists public.get_mobile_approved_work(text);

create or replace function public.get_mobile_approved_work(
  p_equipment_id text
)
returns table(
  activity_id uuid,
  project_id text,
  project_name text,
  phase_id uuid,
  phase_name text,
  section_id uuid,
  section_name text,
  work_component_id uuid,
  work_component_name text,
  component_side text,
  station_start_m numeric,
  station_end_m numeric,
  activity_date date,
  activity text,
  activity_item text,
  activity_quantity numeric,
  actual_quantity numeric,
  remaining_quantity numeric,
  description text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  priority text,
  activity_status text,
  approval_status text,
  equipment_id text,
  equipment_name text,
  assigned_equipment_count integer,
  claimed_equipment_count integer,
  eligible_equipment_count integer,
  is_carryover boolean,
  carryover_from_date date,
  selection_available boolean,
  selection_reason text
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  return query
  with assigned as (
    select pae.activity_id, pae.equipment_id
    from public.project_activity_equipment pae
    where pae.equipment_id::text = p_equipment_id::text
  ),
  all_assigned as (
    select pae.activity_id, count(*)::integer as assigned_equipment_count
    from public.project_activity_equipment pae
    group by pae.activity_id
  ),
  actual as (
    select aa.project_activity_id, round(coalesce(sum(aa.quantity), 0), 2) as actual_quantity
    from public.attendance_activities aa
    where aa.project_activity_id is not null
    group by aa.project_activity_id
  ),
  today_claims as (
    select
      a.project_activity_id,
      count(distinct a.equipment_id)::integer as claimed_equipment_count,
      bool_or(a.equipment_id::text = p_equipment_id::text) as equipment_already_claimed
    from public.attendance a
    join public.project_activity_equipment pae
      on pae.activity_id = a.project_activity_id
     and pae.equipment_id::text = a.equipment_id::text
    where a.attendance_date = v_today
      and a.project_activity_id is not null
      and a.equipment_id is not null
      and upper(coalesce(a.status, '')) in ('IN', 'COMPLETED')
    group by a.project_activity_id
  )
  select
    pa.activity_id,
    pa.project_id::text,
    pa.project_name,
    pa.phase_id,
    pp.phase_name,
    pa.section_id,
    ps.section_name,
    pa.work_component_id,
    pwc.component_name,
    pwc.component_side,
    pa.station_start_m,
    pa.station_end_m,
    pa.activity_date,
    pa.activity,
    pa.activity_item,
    pa.activity_quantity,
    coalesce(ac.actual_quantity, 0),
    greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0),
    pa.description,
    pa.scheduled_start,
    pa.scheduled_end,
    pa.priority,
    pa.activity_status,
    pa.approval_status,
    p_equipment_id::text,
    coalesce(e.equipment_name, 'Equipment'),
    aa.assigned_equipment_count,
    coalesce(tc.claimed_equipment_count, 0),
    case
      when pa.activity_date < v_today
        then least(
          ceil(greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0))::integer,
          aa.assigned_equipment_count
        )
      else aa.assigned_equipment_count
    end,
    (pa.activity_date < v_today),
    case when pa.activity_date < v_today then pa.activity_date else null end,
    case
      when upper(coalesce(pa.activity_status, '')) in ('DONE', 'CANCELLED', 'NOT DONE', 'REJECTED') then false
      when pa.activity_date < v_today then
        greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0) > 0
        and coalesce(tc.claimed_equipment_count, 0) <
            least(
              ceil(greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0))::integer,
              aa.assigned_equipment_count
            )
        and not coalesce(tc.equipment_already_claimed, false)
      else true
    end,
    case
      when upper(coalesce(pa.activity_status, '')) = 'DONE' then 'Activity is DONE.'
      when upper(coalesce(pa.activity_status, '')) in ('CANCELLED', 'NOT DONE', 'REJECTED') then 'Activity is not available for Time IN.'
      when pa.activity_date < v_today and greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0) <= 0 then 'No quantity remains.'
      when pa.activity_date < v_today and coalesce(tc.equipment_already_claimed, false) then 'This equipment already claimed this carryover activity today.'
      when pa.activity_date < v_today and coalesce(tc.claimed_equipment_count, 0) >= least(
        ceil(greatest(coalesce(pa.activity_quantity, 0) - coalesce(ac.actual_quantity, 0), 0))::integer,
        aa.assigned_equipment_count
      ) then 'The available carryover equipment slots have already been claimed today.'
      else null
    end
  from assigned selected
  join public.project_activities pa on pa.activity_id = selected.activity_id
  left join public.project_phases pp on pp.phase_id = pa.phase_id
  left join public.project_sections ps on ps.section_id = pa.section_id
  left join public.project_work_components pwc on pwc.work_component_id = pa.work_component_id
  join all_assigned aa on aa.activity_id = pa.activity_id
  left join actual ac on ac.project_activity_id = pa.activity_id
  left join today_claims tc on tc.project_activity_id = pa.activity_id
  left join public.equipment e on e.equipment_id::text = p_equipment_id::text
  where upper(coalesce(pa.approval_status, '')) = 'APPROVED'
    and pa.activity_date >= (v_today - 7)
    and pa.activity_date < (v_today + 7)
  order by
    case when pa.activity_status = 'DONE' then 2 else 0 end,
    case when pa.activity_date < v_today then 0 else 1 end,
    pa.activity_date,
    pa.scheduled_start,
    pa.activity;
end;
$function$;

grant execute on function public.get_mobile_approved_work(text) to authenticated;
