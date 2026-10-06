begin;

alter table public.purchase_order_items
  add column if not exists received_date date,
  add column if not exists delivery_reference text,
  add column if not exists receiving_remarks text,
  add column if not exists received_by_name text,
  add column if not exists received_at timestamptz;

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

  select count(*) into v_total_items
  from public.purchase_request_items
  where purchase_request_id=p_purchase_request_id;
  if v_total_items=0 then return v_current; end if;

  with requested as (
    select purchase_request_item_id, quantity
    from public.purchase_request_items
    where purchase_request_id=p_purchase_request_id
  ),
  rollup as (
    select r.purchase_request_item_id,r.quantity,
      coalesce(sum(
        case
          when coalesce(poi.supply_status,'PENDING SUPPLIER CONFIRMATION') in ('UNAVAILABLE','CANCELLED') then 0
          when poi.supply_status='PARTIALLY AVAILABLE' then coalesce(poi.confirmed_quantity,0)
          when poi.supply_status='RECEIVED' then greatest(coalesce(poi.received_quantity,0),coalesce(poi.confirmed_quantity,0))
          else coalesce(poi.quantity,0)
        end
      ),0) as procured_qty,
      coalesce(sum(coalesce(poi.received_quantity,0)),0) as received_qty
    from requested r
    left join public.purchase_order_items poi on poi.purchase_request_item_id=r.purchase_request_item_id
    left join public.purchase_orders po on po.purchase_order_id=poi.purchase_order_id and po.status <> 'CANCELLED'
    group by r.purchase_request_item_id,r.quantity
  )
  select count(*) filter (where received_qty >= quantity),
         count(*) filter (where procured_qty >= quantity),
         bool_or(procured_qty > 0)
  into v_fully_received_items,v_fully_procured_items,v_any_procured
  from rollup;

  if v_fully_received_items=v_total_items then v_status:='CLOSED';
  elsif v_fully_procured_items=v_total_items then v_status:='ORDERED';
  elsif coalesce(v_any_procured,false) then v_status:='PARTIALLY ORDERED';
  else v_status:='APPROVED';
  end if;

  update public.purchase_requests set status=v_status,updated_at=now()
  where purchase_request_id=p_purchase_request_id;

  return v_status;
end
$function$;

commit;