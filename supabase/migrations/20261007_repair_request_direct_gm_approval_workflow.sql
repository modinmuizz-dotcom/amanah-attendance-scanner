begin;

create or replace function public.amanah_submit_approval(
  p_request_type text,
  p_entity_id uuid,
  p_title text,
  p_description text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_permission text;
  v_existing uuid;
  v_id uuid;
  v_action text := upper(coalesce(p_payload->>'request_action','CREATE'));
  v_current_status text;
  v_email text := coalesce(auth.jwt()->>'email','');
  v_name text := coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name',split_part(v_email,'@',1));
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_action not in ('CREATE','CANCEL') then raise exception 'Unsupported approval action.'; end if;

  v_permission := case upper(p_request_type)
    when 'ACTIVITY' then 'schedule.manage'
    when 'PURCHASE_REQUEST' then 'purchasing.manage'
    when 'MAINTENANCE' then 'maintenance.manage'
    when 'MATERIAL_PICKUP' then 'purchasing.manage'
    when 'REPAIR_REQUEST' then 'maintenance.manage'
    else null
  end;

  if v_permission is null then raise exception 'Unsupported approval request type.'; end if;
  if not public.amanah_has_permission(v_permission) then raise exception 'You are not authorized to submit this request.'; end if;

  if v_action='CANCEL' then
    if upper(p_request_type)='ACTIVITY' then
      select approval_status into v_current_status from public.project_activities where activity_id=p_entity_id;
    elsif upper(p_request_type)='PURCHASE_REQUEST' then
      select status into v_current_status from public.purchase_requests where purchase_request_id=p_entity_id;
    elsif upper(p_request_type)='MAINTENANCE' then
      select approval_status into v_current_status from public.equipment_maintenance where maintenance_id=p_entity_id;
    elsif upper(p_request_type)='MATERIAL_PICKUP' then
      select status into v_current_status from public.material_pickup_requests where pickup_request_id=p_entity_id;
    elsif upper(p_request_type)='REPAIR_REQUEST' then
      select status into v_current_status from public.repair_requests where repair_request_id=p_entity_id;
    end if;

    if v_current_status is null then raise exception 'The requested record was not found.'; end if;
    if v_current_status <> 'APPROVED' then raise exception 'Only an approved request can be submitted for cancellation.'; end if;
  else
    select approval_id into v_existing
    from public.amanah_approval_requests
    where request_type=upper(p_request_type) and entity_id=p_entity_id and status='PENDING'
    order by submitted_at desc limit 1;

    if v_existing is not null then
      update public.amanah_approval_requests
      set title=p_title,description=p_description,payload=coalesce(p_payload,'{}'::jsonb),
          requested_by=auth.uid(),requested_by_name=v_name,requester_email=v_email,
          submitted_at=now(),updated_at=now()
      where approval_id=v_existing;
      return v_existing;
    end if;
  end if;

  insert into public.amanah_approval_requests(
    request_type,entity_id,title,description,payload,
    requested_by,requested_by_name,requester_email,status
  )
  values(
    upper(p_request_type),p_entity_id,p_title,p_description,coalesce(p_payload,'{}'::jsonb),
    auth.uid(),v_name,v_email,'PENDING'
  )
  returning approval_id into v_id;

  if v_action='CREATE' then
    if upper(p_request_type)='ACTIVITY' then
      update public.project_activities
      set approval_status='PENDING',approval_requested_by=auth.uid(),approval_requested_at=now(),
          approval_decided_by=null,approval_decided_at=null,approval_remarks=null,
          activity_status='PENDING APPROVAL',updated_at=now()
      where activity_id=p_entity_id;
    elsif upper(p_request_type)='PURCHASE_REQUEST' then
      update public.purchase_requests
      set status='PENDING APPROVAL',reviewed_at=null,reviewed_by=null,review_remarks=null,updated_at=now()
      where purchase_request_id=p_entity_id;
    elsif upper(p_request_type)='MAINTENANCE' then
      update public.equipment_maintenance
      set approval_status='PENDING',approval_requested_by=auth.uid(),approval_requested_at=now(),
          approval_decided_by=null,approval_decided_at=null,approval_remarks=null,updated_at=now()
      where maintenance_id=p_entity_id;
    elsif upper(p_request_type)='MATERIAL_PICKUP' then
      update public.material_pickup_requests
      set status='PENDING APPROVAL',updated_at=now()
      where pickup_request_id=p_entity_id;
    elsif upper(p_request_type)='REPAIR_REQUEST' then
      update public.repair_requests
      set status='PENDING APPROVAL',
          reviewed_by=null,reviewed_at=null,reviewer_notes=null,reviewer_evidence_reviewed=false,
          approved_by=null,approved_at=null,approver_notes=null,approver_evidence_reviewed=false,
          updated_at=now()
      where repair_request_id=p_entity_id;
    end if;
  end if;

  return v_id;
end
$function$;

create or replace function public.amanah_decide_approval(
  p_approval_id uuid,
  p_decision text,
  p_remarks text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text;
  v_entity uuid;
  v_payload jsonb;
  v_action text;
  v_permission text;
  v_email text:=coalesce(auth.jwt()->>'email','');
  v_name text:=coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name',split_part(v_email,'@',1));
  v_status text:=upper(p_decision);
  v_role text;
  v_pickup public.material_pickup_requests%rowtype;
  v_activity_id uuid;
  v_summary text:='';
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_status not in ('APPROVED','REJECTED') then raise exception 'Decision must be APPROVED or REJECTED.'; end if;

  select coalesce((
    select upper(r.role_name)
    from public.amanah_user_roles ur
    join public.amanah_roles r on r.role_id=ur.role_id
    where ur.auth_user_id=auth.uid()
    order by case when upper(r.role_name)='SUPER ADMIN' then 0 when upper(r.role_name)='GENERAL MANAGER' then 1 when upper(r.role_name)='ADMINISTRATOR' then 2 else 3 end,r.role_name
    limit 1
  ),'UNASSIGNED') into v_role;

  if v_role not in ('GENERAL MANAGER','ADMINISTRATOR','SUPER ADMIN') then
    raise exception 'Only the General Manager or an authorized system administrator can approve or reject requests.';
  end if;

  select request_type,entity_id,payload into v_type,v_entity,v_payload
  from public.amanah_approval_requests
  where approval_id=p_approval_id and status='PENDING';

  if v_type is null then raise exception 'Pending approval request not found.'; end if;

  v_action:=upper(coalesce(v_payload->>'request_action','CREATE'));

  v_permission:=case v_type
    when 'ACTIVITY' then 'schedule.approve'
    when 'PURCHASE_REQUEST' then 'purchasing.approve'
    when 'MAINTENANCE' then 'maintenance.approve'
    when 'MATERIAL_PICKUP' then 'purchasing.approve'
    when 'REPAIR_REQUEST' then 'maintenance.approve'
    else null
  end;

  if v_permission is null or not public.amanah_has_permission(v_permission) then
    raise exception 'You are not authorized to approve this request.';
  end if;

  update public.amanah_approval_requests
  set status=v_status,decided_by=auth.uid(),decided_by_name=v_name,decided_at=now(),
      decision_remarks=p_remarks,updated_at=now()
  where approval_id=p_approval_id;

  if v_action='CANCEL' then
    if v_type='ACTIVITY' then
      update public.project_activities
      set approval_status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,
          approval_decided_by=auth.uid(),approval_decided_at=now(),approval_remarks=p_remarks,
          activity_status=case when v_status='APPROVED' then 'CANCELLED' else activity_status end,updated_at=now()
      where activity_id=v_entity;
    elsif v_type='PURCHASE_REQUEST' then
      update public.purchase_requests
      set status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,
          reviewed_by=v_email,reviewed_at=now(),
          review_remarks=coalesce(nullif(p_remarks,''),'Cancellation request reviewed by General Manager.'),
          updated_at=now()
      where purchase_request_id=v_entity;
      if not found then raise exception 'Purchase Request record not found.'; end if;
    elsif v_type='MAINTENANCE' then
      update public.equipment_maintenance
      set approval_status=case when v_status='APPROVED' then 'CANCELLED' else 'REJECTED' end,
          approval_decided_by=auth.uid(),approval_decided_at=now(),approval_remarks=p_remarks,updated_at=now()
      where maintenance_id=v_entity;
    elsif v_type='MATERIAL_PICKUP' then
      update public.material_pickup_requests
      set status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,
          rejected_reason=p_remarks,updated_at=now()
      where pickup_request_id=v_entity;
    elsif v_type='REPAIR_REQUEST' then
      update public.repair_requests
      set status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,
          approver_notes=p_remarks,updated_at=now()
      where repair_request_id=v_entity;
    end if;
    return;
  end if;

  if v_type='MATERIAL_PICKUP' and v_action='CREATE' then
    select * into v_pickup from public.material_pickup_requests where pickup_request_id=v_entity for update;
    if not found then raise exception 'Material Pickup Request not found.'; end if;

    if v_status='REJECTED' then
      update public.material_pickup_requests set status='REJECTED',rejected_reason=p_remarks,updated_at=now()
      where pickup_request_id=v_entity;
    else
      update public.material_pickup_requests
      set status='APPROVED',approved_by=auth.uid(),approved_by_name=v_name,approved_at=now(),
          rejected_reason=null,updated_at=now()
      where pickup_request_id=v_entity;

      if v_pickup.activity_id is null then
        select string_agg(format('%s: %s %s',material_name,quantity,unit),' • ' order by created_at)
        into v_summary
        from public.material_pickup_request_items
        where pickup_request_id=v_entity;

        if v_summary is null then v_summary:=v_pickup.material_name||': '||v_pickup.quantity||' '||v_pickup.unit; end if;

        insert into public.project_activities(
          project_id,project_name,activity_date,activity,description,manpower,equipment,accomplishment,
          remarks,created_by,activity_status,approval_status,approval_requested_by,approval_requested_at,
          approval_decided_by,approval_decided_at,approval_remarks,activity_item,activity_quantity,
          scheduled_start,scheduled_end,priority,material_pickup_request_id
        )
        values(
          v_pickup.project_id,v_pickup.project_name,v_pickup.pickup_date,'MATERIAL PICKUP',
          'PICK UP AT: '||v_pickup.pickup_location||' • DELIVER TO: '||coalesce(v_pickup.project_location,v_pickup.project_name)||
          case when coalesce(v_pickup.remarks,'')='' then '' else ' • '||v_pickup.remarks end,
          0,v_pickup.equipment_name,0,
          'PO '||coalesce(v_payload->>'purchase_order_no','')||' • '||coalesce(v_pickup.pickup_request_no,'')||' • '||v_summary,
          v_pickup.requested_by,'PLANNED','APPROVED',v_pickup.requested_by,v_pickup.requested_at,
          auth.uid(),now(),p_remarks,v_summary,
          (select coalesce(sum(quantity),0) from public.material_pickup_request_items where pickup_request_id=v_entity),
          v_pickup.scheduled_start,v_pickup.scheduled_end,'HIGH',v_pickup.pickup_request_id
        )
        returning activity_id into v_activity_id;

        insert into public.project_activity_equipment(activity_id,equipment_id)
        values(v_activity_id,v_pickup.equipment_id)
        on conflict(activity_id,equipment_id) do nothing;

        update public.material_pickup_requests set activity_id=v_activity_id,updated_at=now()
        where pickup_request_id=v_entity;
      end if;
    end if;
    return;
  end if;

  if v_type='ACTIVITY' then
    update public.project_activities
    set approval_status=case when v_status='APPROVED' then 'APPROVED' else 'REJECTED' end,
        approval_decided_by=auth.uid(),approval_decided_at=now(),approval_remarks=p_remarks,
        activity_status=case when v_status='APPROVED' then 'PLANNED' else 'REJECTED' end,updated_at=now()
    where activity_id=v_entity;
  elsif v_type='PURCHASE_REQUEST' then
    update public.purchase_requests
    set status=v_status,reviewed_by=v_email,reviewed_at=now(),review_remarks=p_remarks,updated_at=now()
    where purchase_request_id=v_entity;
  elsif v_type='MAINTENANCE' then
    update public.equipment_maintenance
    set approval_status=case when v_status='APPROVED' then 'APPROVED' else 'REJECTED' end,
        approval_decided_by=auth.uid(),approval_decided_at=now(),approval_remarks=p_remarks,updated_at=now()
    where maintenance_id=v_entity;
  elsif v_type='REPAIR_REQUEST' then
    update public.repair_requests
    set status=case when v_status='APPROVED' then 'APPROVED' else 'RETURNED' end,
        approved_by=case when v_status='APPROVED' then auth.uid() else null end,
        approved_at=case when v_status='APPROVED' then now() else null end,
        approver_notes=p_remarks,
        approver_evidence_reviewed=false,
        updated_at=now()
    where repair_request_id=v_entity;
    if not found then raise exception 'Repair Request record not found.'; end if;
  end if;
end
$function$;

commit;