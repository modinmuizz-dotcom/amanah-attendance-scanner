-- Live-system follow-up for READY FOR PICKUP rollups.
-- Kept as a standalone migration so the repository matches the deployed database behavior.

create or replace function public.amanah_refresh_purchase_order_status(p_purchase_order_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_items integer;
  v_cancelled integer;
  v_received integer;
  v_partial boolean;
  v_pending boolean;
  v_unavailable boolean;
  v_ready boolean;
begin
  select status into v_status from public.purchase_orders where purchase_order_id=p_purchase_order_id;
  if v_status is null then raise exception 'Purchase Order not found.'; end if;
  select count(*),
         count(*) filter (where supply_status='CANCELLED'),
         count(*) filter (where supply_status='RECEIVED'),
         bool_or(supply_status='PARTIALLY AVAILABLE' or supply_status='SUBSTITUTE PROPOSED'),
         bool_or(supply_status='PENDING SUPPLIER CONFIRMATION'),
         bool_or(supply_status='UNAVAILABLE' or supply_status='BACKORDERED'),
         bool_or(supply_status='READY FOR PICKUP')
  into v_items,v_cancelled,v_received,v_partial,v_pending,v_unavailable,v_ready
  from public.purchase_order_items
  where purchase_order_id=p_purchase_order_id;

  if v_items=0 then return v_status; end if;
  if v_cancelled=v_items then v_status:='CANCELLED';
  elsif v_received+v_cancelled=v_items then v_status:='RECEIVED';
  elsif v_received>0 or v_partial then v_status:='PARTIALLY RECEIVED';
  elsif v_ready then v_status:='READY FOR PICKUP';
  elsif v_unavailable or v_pending then v_status:='WAITING FOR SUPPLIER';
  else v_status:=case when v_status='DRAFT' then 'DRAFT' else 'SENT TO SUPPLIER' end;
  end if;

  update public.purchase_orders set status=v_status,updated_at=now()
  where purchase_order_id=p_purchase_order_id;
  return v_status;
end
$function$;

create or replace function public.amanah_refresh_purchase_request_status(p_purchase_request_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current text;
  v_total_items integer;
  v_fully_received_items integer;
  v_fully_procured_items integer;
  v_any_procured boolean := false;
  v_status text;
begin
  select status into v_current from public.purchase_requests where purchase_request_id=p_purchase_request_id;
  if v_current is null then raise exception 'Purchase Request not found.'; end if;
  if v_current in ('REJECTED','CANCELLED') then return v_current; end if;
  select count(*) into v_total_items from public.purchase_request_items where purchase_request_id=p_purchase_request_id;
  if v_total_items=0 then return v_current; end if;

  with requested as (
    select purchase_request_item_id,quantity from public.purchase_request_items where purchase_request_id=p_purchase_request_id
  ), rollup as (
    select r.purchase_request_item_id,r.quantity,
      coalesce(sum(
        case
          when coalesce(poi.supply_status,'PENDING SUPPLIER CONFIRMATION') in ('UNAVAILABLE','CANCELLED') then 0
          when poi.supply_status in ('PARTIALLY AVAILABLE','AVAILABLE','READY FOR PICKUP','SUBSTITUTE APPROVED') then coalesce(poi.confirmed_quantity,0)
          when poi.supply_status='RECEIVED' then greatest(coalesce(poi.received_quantity,0),coalesce(poi.confirmed_quantity,0))
          else coalesce(poi.quantity,0)
        end
      ),0) as procured_qty,
      coalesce(sum(coalesce(poi.received_quantity,0)),0) as received_qty
    from requested r
    left join public.purchase_order_items poi on poi.purchase_request_item_id=r.purchase_request_item_id
    left join public.purchase_orders po on po.purchase_order_id=poi.purchase_order_id and po.status<>'CANCELLED'
    group by r.purchase_request_item_id,r.quantity
  )
  select count(*) filter(where received_qty>=quantity),
         count(*) filter(where procured_qty>=quantity),
         bool_or(procured_qty>0)
  into v_fully_received_items,v_fully_procured_items,v_any_procured
  from rollup;

  if v_fully_received_items=v_total_items then v_status:='CLOSED';
  elsif v_fully_procured_items=v_total_items then v_status:='ORDERED';
  elsif coalesce(v_any_procured,false) then v_status:='PARTIALLY ORDERED';
  else v_status:='APPROVED';
  end if;

  update public.purchase_requests set status=v_status,updated_at=now() where purchase_request_id=p_purchase_request_id;
  return v_status;
end
$function$;