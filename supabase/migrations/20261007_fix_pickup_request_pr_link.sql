begin;

update public.purchase_orders po
set purchase_request_id=pr.purchase_request_id
from public.purchase_requests pr
where po.purchase_request_id is null
  and po.purchase_request_no is not null
  and pr.request_no=po.purchase_request_no;

create or replace function public.amanah_create_material_pickup_request(
  p_purchase_order_item_id uuid,
  p_equipment_id text,
  p_pickup_date date,
  p_start_time text default '08:00',
  p_end_time text default '17:00',
  p_pickup_location text default null,
  p_quantity numeric default null,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_email text:=coalesce(auth.jwt()->>'email','');
  v_name text:=coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->'user_metadata'->>'name',split_part(v_email,'@',1));
  v_item public.purchase_order_items%rowtype;
  v_po public.purchase_orders%rowtype;
  v_supplier public.suppliers%rowtype;
  v_equipment public.equipment%rowtype;
  v_pr public.purchase_requests%rowtype;
  v_requested numeric;
  v_available numeric;
  v_location text;
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_approval uuid;
begin
  if v_uid is null then raise exception 'Authentication is required.'; end if;
  if not public.amanah_has_permission('purchasing.manage') then raise exception 'You are not authorized to create a Material Pickup Request.'; end if;
  if p_pickup_date is null then raise exception 'Pickup date is required.'; end if;

  select * into v_item from public.purchase_order_items where purchase_order_item_id=p_purchase_order_item_id for update;
  if not found then raise exception 'Purchase Order material line not found.'; end if;

  select * into v_po from public.purchase_orders where purchase_order_id=v_item.purchase_order_id;
  if not found then raise exception 'Purchase Order not found.'; end if;
  if v_po.status in ('CANCELLED','CLOSED') then raise exception 'This Purchase Order cannot receive a pickup request.'; end if;

  select * into v_pr
  from public.purchase_requests
  where purchase_request_id=v_po.purchase_request_id
     or request_no=v_po.purchase_request_no
  order by case when purchase_request_id=v_po.purchase_request_id then 0 else 1 end
  limit 1;
  if not found then raise exception 'The Purchase Order is not linked to a Purchase Request.'; end if;

  if v_item.supply_status<>'AVAILABLE' then raise exception 'Material pickup can only be requested after supplier availability is recorded as AVAILABLE.'; end if;

  select * into v_supplier from public.suppliers where supplier_id=v_po.supplier_id;
  select * into v_equipment from public.equipment where equipment_id=p_equipment_id and status='ACTIVE';
  if not found then raise exception 'The selected pickup unit is not active.'; end if;

  v_available:=greatest(coalesce(v_item.confirmed_quantity,0)-coalesce(v_item.received_quantity,0),0);
  if v_available<=0 then raise exception 'There is no confirmed quantity remaining for pickup.'; end if;

  v_requested:=coalesce(p_quantity,v_available);
  if v_requested<=0 or v_requested>v_available then
    raise exception 'Pickup quantity must be greater than zero and cannot exceed the confirmed unreceived quantity (%).',v_available;
  end if;

  if exists(select 1 from public.material_pickup_requests where purchase_order_item_id=v_item.purchase_order_item_id and status in ('PENDING APPROVAL','APPROVED')) then
    raise exception 'A Material Pickup Request is already pending or approved for this material line.';
  end if;

  v_location:=nullif(btrim(coalesce(p_pickup_location,'')),'');
  if v_location is null then v_location:=coalesce(v_supplier.address,v_po.supplier_address,'Supplier pickup location'); end if;

  v_start:=(p_pickup_date::text||' '||coalesce(nullif(p_start_time,''),'08:00')||':00')::timestamp at time zone 'Asia/Manila';
  v_end:=(p_pickup_date::text||' '||coalesce(nullif(p_end_time,''),'17:00')||':00')::timestamp at time zone 'Asia/Manila';
  if v_end<=v_start then raise exception 'Pickup end time must be after pickup start time.'; end if;

  insert into public.material_pickup_requests(
    purchase_order_id,purchase_order_item_id,purchase_request_id,
    project_id,project_name,project_location,material_name,specifications,quantity,unit,
    supplier_id,supplier_name,supplier_contact,pickup_location,equipment_id,equipment_name,
    pickup_date,scheduled_start,scheduled_end,remarks,status,requested_by,requested_by_name
  )
  values(
    v_item.purchase_order_id,v_item.purchase_order_item_id,v_pr.purchase_request_id,
    v_po.project_id,v_po.project_name,v_po.project_location,v_item.material_name,v_item.specifications,v_requested,v_item.unit,
    v_po.supplier_id,v_po.supplier_name,v_po.supplier_contact,v_location,v_equipment.equipment_id,v_equipment.equipment_name,
    p_pickup_date,v_start,v_end,p_remarks,'PENDING APPROVAL',v_uid,v_name
  )
  returning pickup_request_id into v_id;

  v_approval:=public.amanah_submit_approval(
    'MATERIAL_PICKUP',v_id,
    'Material Pickup: '||v_item.material_name||' — '||v_po.po_no,
    'Pickup request for '||v_requested::text||' '||v_item.unit||' of '||v_item.material_name||' from '||v_po.supplier_name||'.',
    jsonb_build_object(
      'request_action','CREATE','pickup_request_id',v_id,
      'pickup_request_no',(select pickup_request_no from public.material_pickup_requests where pickup_request_id=v_id),
      'purchase_order_id',v_po.purchase_order_id,'purchase_order_no',v_po.po_no,
      'purchase_request_id',v_pr.purchase_request_id,'purchase_request_no',v_pr.request_no,
      'project_id',v_po.project_id,'project_name',v_po.project_name,'project_location',v_po.project_location,
      'material_name',v_item.material_name,'specifications',v_item.specifications,'quantity',v_requested,'unit',v_item.unit,
      'supplier_name',v_po.supplier_name,'pickup_location',v_location,'equipment_id',v_equipment.equipment_id,
      'equipment_name',v_equipment.equipment_name,'pickup_date',p_pickup_date,'scheduled_start',v_start,'scheduled_end',v_end,
      'remarks',p_remarks
    )
  );

  update public.material_pickup_requests set approval_id=v_approval,updated_at=now() where pickup_request_id=v_id;

  return jsonb_build_object(
    'pickup_request_id',v_id,
    'pickup_request_no',(select pickup_request_no from public.material_pickup_requests where pickup_request_id=v_id),
    'approval_id',v_approval,'status','PENDING APPROVAL'
  );
end
$function$;

commit;