begin;

alter table public.purchase_order_items
  add column if not exists supply_status text not null default 'PENDING SUPPLIER CONFIRMATION',
  add column if not exists confirmed_quantity numeric not null default 0,
  add column if not exists received_quantity numeric not null default 0,
  add column if not exists expected_availability_date date,
  add column if not exists supplier_remarks text,
  add column if not exists substitute_material_name text,
  add column if not exists substitute_specifications text,
  add column if not exists substitute_status text not null default 'NONE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='purchase_order_items_supply_status_check'
      and conrelid='public.purchase_order_items'::regclass
  ) then
    alter table public.purchase_order_items
      add constraint purchase_order_items_supply_status_check
      check (supply_status in (
        'PENDING SUPPLIER CONFIRMATION','AVAILABLE','BACKORDERED',
        'PARTIALLY AVAILABLE','UNAVAILABLE','SUBSTITUTE PROPOSED',
        'SUBSTITUTE APPROVED','CANCELLED','RECEIVED'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='purchase_order_items_substitute_status_check'
      and conrelid='public.purchase_order_items'::regclass
  ) then
    alter table public.purchase_order_items
      add constraint purchase_order_items_substitute_status_check
      check (substitute_status in ('NONE','PROPOSED','APPROVED','REJECTED'));
  end if;
end $$;

alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;

alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status = any (array[
    'DRAFT','APPROVED','SENT TO SUPPLIER','WAITING FOR SUPPLIER',
    'PARTIALLY FULFILLED','PARTIALLY RECEIVED','RECEIVED','CANCELLED','CLOSED'
  ]::text[]));

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
  v_partial boolean := false;
  v_status text;
begin
  select status into v_current
  from public.purchase_requests
  where purchase_request_id=p_purchase_request_id;

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
  ordered as (
    select poi.purchase_request_item_id, coalesce(sum(poi.quantity),0) as qty
    from public.purchase_order_items poi
    join public.purchase_orders po on po.purchase_order_id=poi.purchase_order_id
    where po.purchase_request_id=p_purchase_request_id
      and po.status <> 'CANCELLED'
      and coalesce(poi.supply_status,'PENDING SUPPLIER CONFIRMATION') <> 'CANCELLED'
    group by poi.purchase_request_item_id
  )
  select count(*) filter (where coalesce(o.qty,0) >= r.quantity),
         bool_or(coalesce(o.qty,0) > 0 and coalesce(o.qty,0) < r.quantity)
  into v_covered_items, v_partial
  from requested r
  left join ordered o on o.purchase_request_item_id=r.purchase_request_item_id;

  if v_covered_items=v_total_items then v_status:='ORDERED';
  elsif v_covered_items>0 or coalesce(v_partial,false) then v_status:='PARTIALLY ORDERED';
  else v_status:='APPROVED';
  end if;

  update public.purchase_requests
  set status=v_status, updated_at=now()
  where purchase_request_id=p_purchase_request_id;

  return v_status;
end
$function$;

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
begin
  select status into v_status
  from public.purchase_orders
  where purchase_order_id=p_purchase_order_id;

  if v_status is null then raise exception 'Purchase Order not found.'; end if;

  select count(*),
         count(*) filter (where supply_status='CANCELLED'),
         count(*) filter (where supply_status='RECEIVED'),
         bool_or(supply_status='PARTIALLY AVAILABLE' or supply_status='SUBSTITUTE PROPOSED'),
         bool_or(supply_status='PENDING SUPPLIER CONFIRMATION'),
         bool_or(supply_status='UNAVAILABLE' or supply_status='BACKORDERED')
  into v_items,v_cancelled,v_received,v_partial,v_pending,v_unavailable
  from public.purchase_order_items
  where purchase_order_id=p_purchase_order_id;

  if v_items=0 then return v_status; end if;

  if v_cancelled=v_items then v_status:='CANCELLED';
  elsif v_received+v_cancelled=v_items then v_status:='RECEIVED';
  elsif v_received>0 or v_partial then v_status:='PARTIALLY RECEIVED';
  elsif v_unavailable or v_pending then v_status:='WAITING FOR SUPPLIER';
  else v_status:=case when v_status='DRAFT' then 'DRAFT' else 'SENT TO SUPPLIER' end;
  end if;

  update public.purchase_orders
  set status=v_status, updated_at=now()
  where purchase_order_id=p_purchase_order_id;

  return v_status;
end
$function$;

commit;