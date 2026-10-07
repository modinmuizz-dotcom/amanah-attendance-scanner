begin;

create table if not exists public.material_pickup_request_items (
  pickup_request_item_id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null references public.material_pickup_requests(pickup_request_id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(purchase_order_item_id),
  material_name text not null,
  specifications text,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  created_at timestamptz not null default now(),
  unique (pickup_request_id,purchase_order_item_id)
);

create index if not exists idx_material_pickup_request_items_request on public.material_pickup_request_items(pickup_request_id);
create index if not exists idx_material_pickup_request_items_po_item on public.material_pickup_request_items(purchase_order_item_id);

alter table public.material_pickup_requests alter column purchase_order_item_id drop not null;

create or replace function public.amanah_create_material_pickup_batch_request(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_equipment_id text,
  p_pickup_date date,
  p_start_time text default '08:00',
  p_end_time text default '17:00',
  p_remarks text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_email text:=coalesce(auth.jwt()->>'email','');
  v_name text:=coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name',split_part(v_email,'@',1));
  v_po public.purchase_orders%rowtype;
  v_supplier public.suppliers%rowtype;
  v_equipment public.equipment%rowtype;
  v_pr public.purchase_requests%rowtype;
  v_id uuid;
  v_approval uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_item jsonb;
  v_poi public.purchase_order_items%rowtype;
  v_requested numeric;
  v_available numeric;
  v_count integer:=0;
  v_first_item uuid;
  v_material_lines jsonb:='[]'::jsonb;
begin
  if v_uid is null then raise exception 'Authentication is required.'; end if;
  if not public.amanah_has_permission('purchasing.manage') then raise exception 'You are not authorized to create a Material Pickup Request.'; end if;
  if p_pickup_date is null then raise exception 'Pickup date is required.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Select at least one material for pickup.'; end if;

  select * into v_po from public.purchase_orders where purchase_order_id=p_purchase_order_id;
  if not found then raise exception 'Purchase Order not found.'; end if;
  if v_po.status in ('CANCELLED','CLOSED') then raise exception 'This Purchase Order cannot receive a pickup request.'; end if;

  select * into v_pr
  from public.purchase_requests
  where purchase_request_id=v_po.purchase_request_id
     or request_no=v_po.purchase_request_no
  order by case when purchase_request_id=v_po.purchase_request_id then 0 else 1 end
  limit 1;

  select * into v_supplier from public.suppliers where supplier_id=v_po.supplier_id;
  select * into v_equipment from public.equipment where equipment_id=p_equipment_id and status='ACTIVE';
  if not found then raise exception 'The selected pickup unit is not active.'; end if;

  v_start:=(p_pickup_date::text||' '||coalesce(nullif(p_start_time,''),'08:00')||':00')::timestamp at time zone 'Asia/Manila';
  v_end:=(p_pickup_date::text||' '||coalesce(nullif(p_end_time,''),'17:00')||':00')::timestamp at time zone 'Asia/Manila';
  if v_end<=v_start then raise exception 'Pickup end time must be after pickup start time.'; end if;

  insert into public.material_pickup_requests(
    purchase_order_id,purchase_order_item_id,purchase_request_id,project_id,project_name,project_location,
    material_name,specifications,quantity,unit,supplier_id,supplier_name,supplier_contact,pickup_location,
    equipment_id,equipment_name,pickup_date,scheduled_start,scheduled_end,remarks,status,requested_by,requested_by_name
  )
  values(
    v_po.purchase_order_id,null,v_pr.purchase_request_id,v_po.project_id,v_po.project_name,v_po.project_location,
    'MULTIPLE MATERIALS','',0,'MIXED',v_po.supplier_id,v_po.supplier_name,v_po.supplier_contact,
    coalesce(v_supplier.address,v_po.supplier_address,'Supplier pickup location'),
    v_equipment.equipment_id,v_equipment.equipment_name,p_pickup_date,v_start,v_end,p_remarks,'PENDING APPROVAL',v_uid,v_name
  )
  returning pickup_request_id into v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_poi from public.purchase_order_items
    where purchase_order_item_id=(v_item->>'purchase_order_item_id')::uuid
      and purchase_order_id=p_purchase_order_id
    for update;
    if not found then raise exception 'One selected material does not belong to this Purchase Order.'; end if;
    if upper(coalesce(v_poi.supply_status,'')) not in ('AVAILABLE','READY FOR PICKUP') then raise exception '% is not eligible for pickup.',v_poi.material_name; end if;

    v_available:=greatest(coalesce(v_poi.confirmed_quantity,0)-coalesce(v_poi.received_quantity,0),0);
    v_requested:=coalesce((v_item->>'quantity')::numeric,v_available);
    if v_available<=0 or v_requested<=0 or v_requested>v_available then
      raise exception 'Pickup quantity for % must be greater than zero and cannot exceed % %.',v_poi.material_name,v_available,v_poi.unit;
    end if;

    if v_first_item is null then v_first_item:=v_poi.purchase_order_item_id; end if;
    insert into public.material_pickup_request_items(pickup_request_id,purchase_order_item_id,material_name,specifications,quantity,unit)
    values(v_id,v_poi.purchase_order_item_id,v_poi.material_name,v_poi.specifications,v_requested,v_poi.unit);

    v_material_lines:=v_material_lines || jsonb_build_object(
      'purchase_order_item_id',v_poi.purchase_order_item_id,
      'material_name',v_poi.material_name,'specifications',v_poi.specifications,
      'quantity',v_requested,'unit',v_poi.unit
    );
    v_count:=v_count+1;
  end loop;

  update public.material_pickup_requests
  set purchase_order_item_id=v_first_item,
      material_name='MULTIPLE MATERIALS',
      specifications=v_count::text||' MATERIAL(S)',
      quantity=(select coalesce(sum(quantity),0) from public.material_pickup_request_items where pickup_request_id=v_id),
      unit='MIXED',updated_at=now()
  where pickup_request_id=v_id;

  v_approval:=public.amanah_submit_approval(
    'MATERIAL_PICKUP',v_id,
    'Material Pickup: '||v_po.po_no||' ('||v_count::text||' materials)',
    'Pickup request containing '||v_count::text||' material line(s) from '||v_po.supplier_name||' to '||coalesce(v_po.project_location,v_po.project_name)||'.',
    jsonb_build_object(
      'request_action','CREATE','bulk_pickup',true,'pickup_request_id',v_id,
      'pickup_request_no',(select pickup_request_no from public.material_pickup_requests where pickup_request_id=v_id),
      'purchase_order_id',v_po.purchase_order_id,'purchase_order_no',v_po.po_no,
      'purchase_request_id',case when v_pr.purchase_request_id is null then null else v_pr.purchase_request_id end,
      'purchase_request_no',coalesce(v_pr.request_no,v_po.purchase_request_no),
      'project_id',v_po.project_id,'project_name',v_po.project_name,'project_location',v_po.project_location,
      'supplier_name',v_po.supplier_name,'pickup_location',coalesce(v_supplier.address,v_po.supplier_address,'Supplier pickup location'),
      'delivery_location',coalesce(v_po.project_location,v_po.project_name),
      'equipment_id',v_equipment.equipment_id,'equipment_name',v_equipment.equipment_name,
      'pickup_date',p_pickup_date,'scheduled_start',v_start,'scheduled_end',v_end,
      'materials',v_material_lines,'remarks',p_remarks
    )
  );

  update public.material_pickup_requests set approval_id=v_approval,updated_at=now() where pickup_request_id=v_id;

  return jsonb_build_object('pickup_request_id',v_id,'pickup_request_no',(select pickup_request_no from public.material_pickup_requests where pickup_request_id=v_id),'approval_id',v_approval,'status','PENDING APPROVAL','materials',v_material_lines);
end
$function$;

create or replace function public.amanah_mark_purchase_order_delivered_to_site(
  p_purchase_order_id uuid,
  p_receipts jsonb,
  p_delivery_date date default current_date,
  p_delivery_reference text default null,
  p_remarks text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_name text:=coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name',auth.jwt()->>'email','PURCHASING OFFICER');
  v_item jsonb;
  v_poi public.purchase_order_items%rowtype;
  v_receive numeric;
  v_new_received numeric;
  v_count integer:=0;
begin
  if v_uid is null then raise exception 'Authentication is required.'; end if;
  if not public.amanah_has_permission('purchasing.manage') then raise exception 'You are not authorized to record delivery to site.'; end if;
  if p_receipts is null or jsonb_typeof(p_receipts)<>'array' or jsonb_array_length(p_receipts)=0 then raise exception 'Select at least one material to receive.'; end if;

  for v_item in select * from jsonb_array_elements(p_receipts)
  loop
    select * into v_poi from public.purchase_order_items
    where purchase_order_item_id=(v_item->>'purchase_order_item_id')::uuid
      and purchase_order_id=p_purchase_order_id
    for update;

    if not found then raise exception 'One selected delivery material does not belong to this Purchase Order.'; end if;
    if upper(coalesce(v_poi.supply_status,'')) not in ('AVAILABLE','READY FOR PICKUP') then raise exception '% is not available for delivery to site.',v_poi.material_name; end if;

    v_receive:=coalesce((v_item->>'received_quantity')::numeric,0);
    if v_receive<=0 or v_receive>greatest(coalesce(v_poi.confirmed_quantity,0)-coalesce(v_poi.received_quantity,0),0) then
      raise exception 'Invalid received quantity for %.',v_poi.material_name;
    end if;

    v_new_received:=least(coalesce(v_poi.quantity,0),coalesce(v_poi.received_quantity,0)+v_receive);

    update public.purchase_order_items
    set received_quantity=v_new_received,
        ready_for_pickup_quantity=0,
        supply_status=case when coalesce(v_poi.confirmed_quantity,0)>0 and v_new_received>=v_poi.confirmed_quantity then 'RECEIVED' else v_poi.supply_status end,
        received_date=p_delivery_date,delivery_reference=p_delivery_reference,receiving_remarks=p_remarks,
        received_by_name=v_name,received_at=now()
    where purchase_order_item_id=v_poi.purchase_order_item_id;

    v_count:=v_count+1;
  end loop;

  perform public.amanah_refresh_purchase_order_status(p_purchase_order_id);
  return jsonb_build_object('success',true,'received_lines',v_count);
end
$function$;

create or replace function public.amanah_decide_approval(p_approval_id uuid,p_decision text,p_remarks text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_type text; v_entity uuid; v_payload jsonb; v_action text; v_permission text;
  v_email text:=coalesce(auth.jwt()->>'email','');
  v_name text:=coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name',split_part(v_email,'@',1));
  v_status text:=upper(p_decision); v_role text;
  v_pickup public.material_pickup_requests%rowtype; v_activity_id uuid; v_summary text:='';
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_status not in ('APPROVED','REJECTED') then raise exception 'Decision must be APPROVED or REJECTED.'; end if;
  select coalesce((select upper(r.role_name) from public.amanah_user_roles ur join public.amanah_roles r on r.role_id=ur.role_id where ur.auth_user_id=auth.uid()
    order by case when upper(r.role_name)='SUPER ADMIN' then 0 when upper(r.role_name)='GENERAL MANAGER' then 1 when upper(r.role_name)='ADMINISTRATOR' then 2 else 3 end,r.role_name limit 1),'UNASSIGNED') into v_role;
  if v_role not in ('GENERAL MANAGER','ADMINISTRATOR','SUPER ADMIN') then raise exception 'Only the General Manager or an authorized system administrator can approve or reject requests.'; end if;
  select request_type,entity_id,payload into v_type,v_entity,v_payload from public.amanah_approval_requests where approval_id=p_approval_id and status='PENDING';
  if v_type is null then raise exception 'Pending approval request not found.'; end if;
  v_action:=upper(coalesce(v_payload->>'request_action','CREATE'));
  v_permission:=case v_type when 'ACTIVITY' then 'schedule.approve' when 'PURCHASE_REQUEST' then 'purchasing.approve' when 'MAINTENANCE' then 'maintenance.approve' when 'MATERIAL_PICKUP' then 'purchasing.approve' else null end;
  if v_permission is null or not public.amanah_has_permission(v_permission) then raise exception 'You are not authorized to approve this request.'; end if;
  update public.amanah_approval_requests set status=v_status,decided_by=auth.uid(),decided_by_name=v_name,decided_at=now(),decision_remarks=p_remarks,updated_at=now() where approval_id=p_approval_id;

  if v_type='MATERIAL_PICKUP' and v_action='CREATE' then
    select * into v_pickup from public.material_pickup_requests where pickup_request_id=v_entity for update;
    if not found then raise exception 'Material Pickup Request not found.'; end if;

    if v_status='REJECTED' then
      update public.material_pickup_requests set status='REJECTED',rejected_reason=p_remarks,updated_at=now() where pickup_request_id=v_entity;
    else
      update public.material_pickup_requests set status='APPROVED',approved_by=auth.uid(),approved_by_name=v_name,approved_at=now(),rejected_reason=null,updated_at=now() where pickup_request_id=v_entity;
      if v_pickup.activity_id is null then
        select string_agg(format('%s: %s %s',material_name,quantity,unit),' • ' order by created_at) into v_summary from public.material_pickup_request_items where pickup_request_id=v_entity;
        if v_summary is null then v_summary:=v_pickup.material_name||': '||v_pickup.quantity||' '||v_pickup.unit; end if;
        insert into public.project_activities(
          project_id,project_name,activity_date,activity,description,manpower,equipment,accomplishment,remarks,created_by,
          activity_status,approval_status,approval_requested_by,approval_requested_at,approval_decided_by,approval_decided_at,approval_remarks,
          activity_item,activity_quantity,scheduled_start,scheduled_end,priority,material_pickup_request_id
        )
        values(
          v_pickup.project_id,v_pickup.project_name,v_pickup.pickup_date,'MATERIAL PICKUP',
          'PICK UP AT: '||v_pickup.pickup_location||' • DELIVER TO: '||coalesce(v_pickup.project_location,v_pickup.project_name)||
          case when coalesce(v_pickup.remarks,'')='' then '' else ' • '||v_pickup.remarks end,
          0,v_pickup.equipment_name,0,
          'PO '||(v_payload->>'purchase_order_no')||' • '||coalesce(v_pickup.pickup_request_no,'')||' • '||v_summary,
          v_pickup.requested_by,'PLANNED','APPROVED',v_pickup.requested_by,v_pickup.requested_at,auth.uid(),now(),p_remarks,
          v_summary,(select coalesce(sum(quantity),0) from public.material_pickup_request_items where pickup_request_id=v_entity),
          v_pickup.scheduled_start,v_pickup.scheduled_end,'HIGH',v_pickup.pickup_request_id
        )
        returning activity_id into v_activity_id;
        insert into public.project_activity_equipment(activity_id,equipment_id) values(v_activity_id,v_pickup.equipment_id) on conflict(activity_id,equipment_id) do nothing;
        update public.material_pickup_requests set activity_id=v_activity_id,updated_at=now() where pickup_request_id=v_entity;
      end if;
    end if;
    return;
  end if;

  if v_action='CANCEL' then
    if v_type='ACTIVITY' then
      update public.project_activities set approval_status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,approval_decided_by=auth.uid(),approval_decided_at=now(),approval_remarks=p_remarks,activity_status=case when v_status='APPROVED' then 'CANCELLED' else activity_status end,updated_at=now() where activity_id=v_entity;
    elsif v_type='PURCHASE_REQUEST' then
      update public.purchase_requests set status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,reviewed_by=v_email,reviewed_at=now(),review_remarks=p_remarks,updated_at=now() where purchase_request_id=v_entity;
    elsif v_type='MAINTENANCE' then
      update public.equipment_maintenance set approval_status=case when v_status='APPROVED' then 'CANCELLED' else 'REJECTED' end,approval_decided_by=auth.uid(),approval_decided_at=now(),approval_remarks=p_remarks,updated_at=now() where maintenance_id=v_entity;
    elsif v_type='MATERIAL_PICKUP' then
      update public.material_pickup_requests set status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,rejected_reason=p_remarks,updated_at=now() where pickup_request_id=v_entity;
    end if;
  elsif v_type='ACTIVITY' then
    update public.project_activities set approval_status=case when v_status='APPROVED' then 'APPROVED' else 'REJECTED' end,approval_decided_by=auth.uid(),approval_decided_at=now(),approval_remarks=p_remarks,activity_status=case when v_status='APPROVED' then 'PLANNED' else 'REJECTED' end,updated_at=now() where activity_id=v_entity;
  elsif v_type='PURCHASE_REQUEST' then
    update public.purchase_requests set status=v_status,reviewed_by=v_email,reviewed_at=now(),review_remarks=p_remarks,updated_at=now() where purchase_request_id=v_entity;
  elsif v_type='MAINTENANCE' then
    update public.equipment_maintenance set approval_status=case when v_status='APPROVED' then 'APPROVED' else 'REJECTED' end,approval_decided_by=auth.uid(),approval_decided_at=now(),approval_remarks=p_remarks,updated_at=now() where maintenance_id=v_entity;
  end if;
end
$function$;

create or replace function public.amanah_complete_material_pickup_activity()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_pickup public.material_pickup_requests%rowtype;
  v_po_item public.purchase_order_items%rowtype;
  v_new_received numeric;
  v_new_status text;
  v_child record;
begin
  if new.material_pickup_request_id is null then return new; end if;
  if upper(coalesce(new.activity_status,''))<>'DONE' or upper(coalesce(old.activity_status,''))='DONE' then return new; end if;

  select * into v_pickup from public.material_pickup_requests where pickup_request_id=new.material_pickup_request_id for update;
  if not found or v_pickup.status='COMPLETED' then return new; end if;

  if exists(select 1 from public.material_pickup_request_items where pickup_request_id=v_pickup.pickup_request_id) then
    for v_child in select * from public.material_pickup_request_items where pickup_request_id=v_pickup.pickup_request_id loop
      select * into v_po_item from public.purchase_order_items where purchase_order_item_id=v_child.purchase_order_item_id for update;
      if not found then raise exception 'Pickup material line not found.'; end if;
      v_new_received:=least(coalesce(v_po_item.quantity,0),coalesce(v_po_item.received_quantity,0)+coalesce(v_child.quantity,0));
      if v_new_received>=coalesce(v_po_item.confirmed_quantity,0) and coalesce(v_po_item.confirmed_quantity,0)>0 then v_new_status:='RECEIVED'; else v_new_status:=v_po_item.supply_status; end if;
      update public.purchase_order_items
      set received_quantity=v_new_received,ready_for_pickup_quantity=0,supply_status=v_new_status,received_date=current_date,
          delivery_reference='ACTIVITY:'||new.activity_id::text,receiving_remarks=coalesce(receiving_remarks,'Material pickup completed through AMANAH Activity Calendar.'),received_at=now()
      where purchase_order_item_id=v_child.purchase_order_item_id;
    end loop;
  else
    select * into v_po_item from public.purchase_order_items where purchase_order_item_id=v_pickup.purchase_order_item_id for update;
    if found then
      v_new_received:=least(coalesce(v_po_item.quantity,0),coalesce(v_po_item.received_quantity,0)+coalesce(v_pickup.quantity,0));
      update public.purchase_order_items
      set received_quantity=v_new_received,ready_for_pickup_quantity=0,
          supply_status=case when v_new_received>=coalesce(v_po_item.confirmed_quantity,0) and coalesce(v_po_item.confirmed_quantity,0)>0 then 'RECEIVED' else v_po_item.supply_status end,
          received_date=current_date,delivery_reference='ACTIVITY:'||new.activity_id::text,receiving_remarks=coalesce(receiving_remarks,'Material pickup completed through AMANAH Activity Calendar.'),received_at=now()
      where purchase_order_item_id=v_pickup.purchase_order_item_id;
    end if;
  end if;

  update public.material_pickup_requests set status='COMPLETED',completed_at=now(),updated_at=now() where pickup_request_id=v_pickup.pickup_request_id;
  perform public.amanah_refresh_purchase_order_status(v_pickup.purchase_order_id);
  if v_pickup.purchase_request_id is not null then perform public.amanah_refresh_purchase_request_status(v_pickup.purchase_request_id); end if;
  return new;
end
$function$;

commit;