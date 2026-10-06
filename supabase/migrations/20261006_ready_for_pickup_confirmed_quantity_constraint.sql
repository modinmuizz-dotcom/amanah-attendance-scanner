alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_ready_for_pickup_quantity_check;

alter table public.purchase_order_items
  add constraint purchase_order_items_ready_for_pickup_quantity_check
  check (
    ready_for_pickup_quantity >= 0
    and ready_for_pickup_quantity <= quantity
    and ready_for_pickup_quantity <= greatest(coalesce(confirmed_quantity,0)-coalesce(received_quantity,0),0)
  );