create or replace function public.amanah_complete_material_pickup_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pickup public.material_pickup_requests%rowtype;
  v_po_item public.purchase_order_items%rowtype;
  v_new_received numeric;
  v_new_status text;
begin
  if new.material_pickup_request_id is null then return new; end if;
  if upper(coalesce(new.activity_status,''))<>'DONE'
     or upper(coalesce(old.activity_status,''))='DONE' then return new; end if;

  select * into v_pickup from public.material_pickup_requests
  where pickup_request_id=new.material_pickup_request_id
  for update;
  if not found or v_pickup.status='COMPLETED' then return new; end if;

  select * into v_po_item from public.purchase_order_items
  where purchase_order_item_id=v_pickup.purchase_order_item_id
  for update;
  if not found then return new; end if;

  v_new_received:=least(
    coalesce(v_po_item.quantity,0),
    coalesce(v_po_item.received_quantity,0)+coalesce(v_pickup.quantity,0)
  );

  if coalesce(v_po_item.confirmed_quantity,0)>0
     and v_new_received>=v_po_item.confirmed_quantity then
    v_new_status:='RECEIVED';
  else
    v_new_status:=v_po_item.supply_status;
  end if;

  update public.purchase_order_items
  set received_quantity=v_new_received,
      ready_for_pickup_quantity=0,
      supply_status=v_new_status,
      received_date=current_date,
      delivery_reference='ACTIVITY:'||new.activity_id::text,
      receiving_remarks=coalesce(receiving_remarks,'Material pickup completed through AMANAH Activity Calendar.'),
      received_at=now()
  where purchase_order_item_id=v_pickup.purchase_order_item_id;

  update public.material_pickup_requests
  set status='COMPLETED',completed_at=now(),updated_at=now()
  where pickup_request_id=v_pickup.pickup_request_id;

  perform public.amanah_refresh_purchase_order_status(v_pickup.purchase_order_id);

  if v_pickup.purchase_request_id is not null then
    perform public.amanah_refresh_purchase_request_status(v_pickup.purchase_request_id);
  end if;

  return new;
end
$function$;