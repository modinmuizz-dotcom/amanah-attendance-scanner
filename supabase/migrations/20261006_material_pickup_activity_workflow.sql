begin;

create sequence if not exists public.material_pickup_request_no_seq;

create table if not exists public.material_pickup_requests (
  pickup_request_id uuid primary key default gen_random_uuid(),
  pickup_request_no text unique,
  purchase_order_id uuid not null references public.purchase_orders(purchase_order_id) on delete restrict,
  purchase_order_item_id uuid not null references public.purchase_order_items(purchase_order_item_id) on delete restrict,
  purchase_request_id uuid not null references public.purchase_requests(purchase_request_id) on delete restrict,
  project_id text,
  project_name text not null,
  project_location text,
  material_name text not null,
  specifications text,
  quantity numeric not null check(quantity>0),
  unit text not null,
  supplier_id uuid references public.suppliers(supplier_id) on delete set null,
  supplier_name text not null,
  supplier_contact text,
  pickup_location text not null,
  equipment_id text not null references public.equipment(equipment_id) on delete restrict,
  equipment_name text not null,
  pickup_date date not null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  remarks text,
  status text not null default 'PENDING APPROVAL'
    check(status in ('PENDING APPROVAL','APPROVED','REJECTED','CANCELLED','COMPLETED')),
  approval_id uuid references public.amanah_approval_requests(approval_id) on delete set null,
  activity_id uuid references public.project_activities(activity_id) on delete set null,
  requested_by uuid,
  requested_by_name text,
  requested_at timestamptz not null default now(),
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  rejected_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_pickup_po_item on public.material_pickup_requests(purchase_order_item_id);
create index if not exists idx_material_pickup_status on public.material_pickup_requests(status);
create index if not exists idx_material_pickup_activity on public.material_pickup_requests(activity_id);

create or replace function public.set_material_pickup_request_no()
returns trigger language plpgsql as $$
begin
  if new.pickup_request_no is null or btrim(new.pickup_request_no)='' then
    new.pickup_request_no := 'MPR-'||to_char(coalesce(new.requested_at,now()),'YYYYMMDD')||'-'||lpad(nextval('public.material_pickup_request_no_seq')::text,4,'0');
  end if;
  return new;
end; $$;

drop trigger if exists trg_material_pickup_request_no on public.material_pickup_requests;
create trigger trg_material_pickup_request_no before insert on public.material_pickup_requests
for each row execute function public.set_material_pickup_request_no();

alter table public.project_activities add column if not exists material_pickup_request_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='project_activities_material_pickup_request_id_fkey'
      and conrelid='public.project_activities'::regclass
  ) then
    alter table public.project_activities
      add constraint project_activities_material_pickup_request_id_fkey
      foreign key(material_pickup_request_id)
      references public.material_pickup_requests(pickup_request_id)
      on delete set null;
  end if;
end $$;

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
begin
  if new.material_pickup_request_id is null then return new; end if;
  if upper(coalesce(new.activity_status,'')) <> 'DONE'
     or upper(coalesce(old.activity_status,''))='DONE' then return new; end if;

  select * into v_pickup from public.material_pickup_requests
  where pickup_request_id=new.material_pickup_request_id for update;
  if not found or v_pickup.status='COMPLETED' then return new; end if;

  select * into v_po_item from public.purchase_order_items
  where purchase_order_item_id=v_pickup.purchase_order_item_id for update;
  if not found then return new; end if;

  v_new_received:=least(
    coalesce(v_po_item.quantity,0),
    coalesce(v_po_item.received_quantity,0)+coalesce(v_pickup.quantity,0)
  );

  update public.purchase_order_items
  set received_quantity=v_new_received,
      received_date=current_date,
      delivery_reference='ACTIVITY:'||new.activity_id::text,
      receiving_remarks=coalesce(receiving_remarks,'Material pickup completed through AMANAH Activity Calendar.'),
      received_at=now()
  where purchase_order_item_id=v_pickup.purchase_order_item_id;

  update public.material_pickup_requests
  set status='COMPLETED',completed_at=now(),updated_at=now()
  where pickup_request_id=v_pickup.pickup_request_id;

  perform public.amanah_refresh_purchase_order_status(v_pickup.purchase_order_id);
  perform public.amanah_refresh_purchase_request_status(v_pickup.purchase_request_id);
  return new;
end
$function$;

drop trigger if exists trg_complete_material_pickup_activity on public.project_activities;
create trigger trg_complete_material_pickup_activity
after update of activity_status on public.project_activities
for each row
when (new.material_pickup_request_id is not null)
execute function public.amanah_complete_material_pickup_activity();

commit;