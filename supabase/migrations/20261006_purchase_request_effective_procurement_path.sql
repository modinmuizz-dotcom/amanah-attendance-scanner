create or replace function public.amanah_refresh_purchase_request_status(p_purchase_request_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_current text;
  v_total_items integer;
  v_covered_items integer;
  v_status text;
begin
  select status into v_current from public.purchase_requests where purchase_request_id=p_purchase_request_id;
  if v_current is null then raise exception 'Purchase Request not found.'; end if;
  if v_current in ('REJECTED','CANCELLED','CLOSED') then return v_current; end if;

  select count(*) into v_total_items
  from public.purchase_request_items
  where purchase_request_id=p_purchase_request_id;
  if v_total_items=0 then return v_current; end if;

  with requested as (
    select purchase_request_item_id, quantity
    from public.purchase_request_items
    where purchase_request_id=p_purchase_request_id
  ),
  covered as (
    select
      poi.purchase_request_item_id,
      sum(
        case
          when coalesce(poi.supply_status,'PENDING SUPPLIER CONFIRMATION') in (
            'PENDING SUPPLIER CONFIRMATION','AVAILABLE','BACKORDERED',
            'SUBSTITUTE PROPOSED','SUBSTITUTE APPROVED'
          ) then poi.quantity
          when poi.supply_status='PARTIALLY AVAILABLE' then coalesce(poi.confirmed_quantity,0)
          when poi.supply_status='RECEIVED' then coalesce(poi.received_quantity,0)
          else 0
        end
      ) as covered_qty
    from public.purchase_order_items poi
    join public.purchase_orders po on po.purchase_order_id=poi.purchase_order_id
    where po.purchase_request_id=p_purchase_request_id
      and po.status <> 'CANCELLED'
    group by poi.purchase_request_item_id
  )
  select count(*)
  into v_covered_items
  from requested r
  left join covered c on c.purchase_request_item_id=r.purchase_request_item_id
  where coalesce(c.covered_qty,0) >= r.quantity;

  if v_covered_items=v_total_items then v_status:='ORDERED';
  elsif v_covered_items>0 then v_status:='PARTIALLY ORDERED';
  else v_status:='APPROVED';
  end if;

  update public.purchase_requests
  set status=v_status, updated_at=now()
  where purchase_request_id=p_purchase_request_id;

  return v_status;
end
$function$;