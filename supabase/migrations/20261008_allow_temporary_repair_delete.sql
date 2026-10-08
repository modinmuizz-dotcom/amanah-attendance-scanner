create or replace function public.amanah_delete_repair_request(p_repair_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_form_no text;
begin
  if v_uid is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.amanah_has_permission('maintenance.manage') then
    raise exception 'You are not authorized to delete repair requests.';
  end if;

  select repair_form_no,status
    into v_form_no,v_status
  from public.repair_requests
  where repair_request_id=p_repair_request_id
  for update;

  if not found then
    raise exception 'Repair Request not found.';
  end if;

  delete from public.repair_requests
  where repair_request_id=p_repair_request_id;

  return jsonb_build_object(
    'success',true,
    'repair_request_id',p_repair_request_id,
    'repair_form_no',v_form_no,
    'previous_status',v_status
  );
end
$function$;

revoke all on function public.amanah_delete_repair_request(uuid) from public;
grant execute on function public.amanah_delete_repair_request(uuid) to authenticated;