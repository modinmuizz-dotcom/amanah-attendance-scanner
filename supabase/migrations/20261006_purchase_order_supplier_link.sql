alter table public.purchase_orders
  add column if not exists supplier_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='purchase_orders_supplier_id_fkey'
      and conrelid='public.purchase_orders'::regclass
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_supplier_id_fkey
      foreign key (supplier_id)
      references public.suppliers(supplier_id)
      on update cascade
      on delete set null;
  end if;
end $$;