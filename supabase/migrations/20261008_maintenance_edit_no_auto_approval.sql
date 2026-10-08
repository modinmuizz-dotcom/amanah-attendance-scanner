-- Prevent maintenance edits from creating a new GM approval request.
-- The function only refreshes the existing PENDING approval details.
create or replace function public.amanah_update_pending_maintenance_approval(
  p_entity_id uuid,
  p_title text,
  p_description text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.amanah_has_permission('maintenance.manage') then
    raise exception 'You are not authorized to update maintenance approvals.';
  end if;

  select approval_id
    into v_id
  from public.amanah_approval_requests
  where request_type='MAINTENANCE'
    and entity_id=p_entity_id
    and status='PENDING'
  order by submitted_at desc
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.amanah_approval_requests
  set title=p_title,
      description=p_description,
      payload=coalesce(p_payload,'{}'::jsonb),
      updated_at=now()
  where approval_id=v_id;

  return v_id;
end
$function$;

revoke all on function public.amanah_update_pending_maintenance_approval(uuid,text,text,jsonb) from public;
grant execute on function public.amanah_update_pending_maintenance_approval(uuid,text,text,jsonb) to authenticated;
