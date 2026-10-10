-- AMANAH Dashboard PROJECT COST CHART
-- Financial estimate utilization only: recorded project expenses / Project Master estimate.
-- This function never reads projects.current_progress or activity accomplishment.
-- Consistent with Project Cost Control: sum project_cost_entries.amount, and
-- sum saved project_material_estimate_items.total_cost for the matching estimate type.
-- NULL estimate means no saved Project Estimate; it is not a zero-cost estimate.

create or replace function public.get_dashboard_project_cost_chart()
returns table (
  project_id text,
  project_name text,
  project_type text,
  project_status text,
  actual_cost numeric,
  estimate_cost numeric,
  cost_usage_percent numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    p.project_id,
    p.project_name,
    p.project_type,
    p.status as project_status,
    coalesce(c.actual_cost, 0::numeric) as actual_cost,
    e.estimate_cost,
    case
      when e.estimate_cost > 0
        then round(coalesce(c.actual_cost, 0::numeric) * 100 / e.estimate_cost, 2)
      else null::numeric
    end as cost_usage_percent
  from public.projects p
  left join lateral (
    select coalesce(sum(ce.amount), 0::numeric) as actual_cost
    from public.project_cost_entries ce
    where ce.project_id = p.project_id
  ) c on true
  left join lateral (
    select coalesce(sum(i.total_cost), 0::numeric) as estimate_cost
    from public.project_material_estimates e0
    left join public.project_material_estimate_items i
      on i.estimate_id = e0.estimate_id
    where e0.project_id = p.project_id
      and e0.estimate_type = case
        when p.project_type = 'CONCRETING OF ROAD' then 'ROAD'
        else 'GENERAL'
      end
    group by e0.estimate_id
  ) e on true
  where (select auth.uid()) is not null
  order by p.project_name nulls last, p.project_id;
$function$;

revoke all on function public.get_dashboard_project_cost_chart() from public, anon;
grant execute on function public.get_dashboard_project_cost_chart() to authenticated;

comment on function public.get_dashboard_project_cost_chart() is
  'Project by project recorded expense vs saved Project Master estimate for dashboard cost chart; never physical accomplishment.';
