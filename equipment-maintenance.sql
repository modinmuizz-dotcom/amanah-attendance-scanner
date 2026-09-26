-- =========================================================
-- AMANAH EQUIPMENT MAINTENANCE & REPAIR
-- =========================================================

create table if not exists public.equipment_maintenance (
  maintenance_id uuid primary key default gen_random_uuid(),
  equipment_id text not null
    references public.equipment(equipment_id)
    on update cascade
    on delete restrict,
  project_id text null
    references public.projects(project_id)
    on update cascade
    on delete set null,
  maintenance_date date not null default current_date,
  maintenance_type text not null
    check (maintenance_type in (
      'PREVENTIVE MAINTENANCE',
      'REPAIR',
      'SPARE PARTS',
      'TIRES',
      'OIL / FLUIDS',
      'OTHER'
    )),
  description text not null,
  supplier_shop text null,
  reference_no text null,
  quantity numeric(15,3) not null default 1
    check (quantity >= 0),
  unit text not null default 'LOT',
  unit_cost numeric(15,2) not null default 0
    check (unit_cost >= 0),
  total_amount numeric(15,2)
    generated always as (
      round(coalesce(quantity,0) * coalesce(unit_cost,0), 2)
    ) stored,
  remarks text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_equipment_maintenance_equipment
  on public.equipment_maintenance(equipment_id);

create index if not exists idx_equipment_maintenance_project
  on public.equipment_maintenance(project_id);

create index if not exists idx_equipment_maintenance_date
  on public.equipment_maintenance(maintenance_date desc);

alter table public.equipment_maintenance enable row level security;

drop policy if exists "authenticated users can read equipment maintenance"
  on public.equipment_maintenance;
drop policy if exists "authenticated users can insert equipment maintenance"
  on public.equipment_maintenance;
drop policy if exists "authenticated users can update equipment maintenance"
  on public.equipment_maintenance;
drop policy if exists "authenticated users can delete equipment maintenance"
  on public.equipment_maintenance;

create policy "authenticated users can read equipment maintenance"
  on public.equipment_maintenance for select to authenticated using (true);

create policy "authenticated users can insert equipment maintenance"
  on public.equipment_maintenance for insert to authenticated with check (true);

create policy "authenticated users can update equipment maintenance"
  on public.equipment_maintenance for update to authenticated
  using (true) with check (true);

create policy "authenticated users can delete equipment maintenance"
  on public.equipment_maintenance for delete to authenticated using (true);

create or replace function public.set_equipment_maintenance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_equipment_maintenance_updated_at
  on public.equipment_maintenance;

create trigger trg_equipment_maintenance_updated_at
before update on public.equipment_maintenance
for each row
execute function public.set_equipment_maintenance_updated_at();

create or replace function public.sync_equipment_maintenance_project_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  equipment_name text;
  ref text;
begin
  if tg_op = 'DELETE' then
    delete from public.project_cost_entries
    where reference_id = 'AUTO-MAINTENANCE:' || old.maintenance_id::text;
    return old;
  end if;

  ref := 'AUTO-MAINTENANCE:' || new.maintenance_id::text;

  delete from public.project_cost_entries
  where reference_id = ref;

  if new.project_id is null or coalesce(new.total_amount,0) <= 0 then
    return new;
  end if;

  select equipment_name
    into equipment_name
  from public.equipment
  where equipment_id = new.equipment_id
  limit 1;

  insert into public.project_cost_entries
  (
    project_id, cost_date, cost_type, description,
    quantity, unit, unit_cost, amount, reference_id, notes
  )
  values
  (
    new.project_id,
    new.maintenance_date,
    'EQUIPMENT',
    'Equipment ' || new.maintenance_type || ' - ' ||
      coalesce(equipment_name,new.equipment_id) || ' - ' ||
      new.description,
    new.quantity,
    new.unit,
    new.unit_cost,
    new.total_amount,
    ref,
    'Automatically generated from Equipment Maintenance.'
  );

  return new;
end;
$$;

drop trigger if exists trg_equipment_maintenance_project_cost
  on public.equipment_maintenance;

create trigger trg_equipment_maintenance_project_cost
after insert or update or delete
on public.equipment_maintenance
for each row
execute function public.sync_equipment_maintenance_project_cost();

create unique index if not exists idx_project_cost_auto_maintenance_unique
on public.project_cost_entries(reference_id)
where reference_id like 'AUTO-MAINTENANCE:%';
