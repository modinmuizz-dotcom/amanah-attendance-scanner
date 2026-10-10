-- AMANAH Project Cost Control: read the SAVED Project Master estimate.
-- Includes all estimate line items (materials, labor and any custom items).
-- Only the matching ROAD or GENERAL estimate is used, consistent with admin.js.
-- Returns NULL when an estimate was never saved, instead of substituting a contract/budget.
-- SEC INVOKER preserves existing estimate table RLS permissions.

create or replace function public.get_project_estimate_cost(
  p_project_id text,
  p_estimate_type text
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $function$
  select case
    when count(e.estimate_id) = 0 then null::numeric
    else coalesce(sum(i.total_cost), 0::numeric)
  end
  from public.project_material_estimates e
  left join public.project_material_estimate_items i
    on i.estimate_id = e.estimate_id
  where e.project_id = p_project_id
    and e.estimate_type = p_estimate_type;
$function$;

revoke all on function public.get_project_estimate_cost(text, text) from public, anon;
grant execute on function public.get_project_estimate_cost(text, text) to authenticated;

comment on function public.get_project_estimate_cost(text, text) is
  'Read-only sum of saved Project Master estimate line total_cost values, including labor. Returns NULL if no matching estimate exists.';
