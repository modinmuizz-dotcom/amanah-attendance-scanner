-- =========================================================
-- AMANAH REPAIR COST + EQUIPMENT HISTORY
-- Migration for existing Repair Request module
-- =========================================================

-- ---------------------------------------------------------
-- 1. ACTUAL REPAIR COST LINES
-- ---------------------------------------------------------

create table if not exists public.repair_request_costs (
  repair_cost_id uuid primary key default gen_random_uuid(),

  repair_request_id uuid not null
    references public.repair_requests(repair_request_id)
    on delete cascade,

  cost_type text not null
    check (cost_type in ('LABOR','MATERIAL','OTHER')),

  description text not null,

  quantity numeric(15,3) not null default 1
    check (quantity >= 0),

  unit text null,

  unit_cost numeric(15,2) not null default 0
    check (unit_cost >= 0),

  amount numeric(15,2)
    generated always as (
      round(quantity * unit_cost, 2)
    ) stored,

  reference_no text null,

  notes text null,

  created_by uuid null
    references auth.users(id),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

create index if not exists
idx_repair_request_costs_request
on public.repair_request_costs(repair_request_id);

create index if not exists
idx_repair_request_costs_type
on public.repair_request_costs(cost_type);


-- ---------------------------------------------------------
-- 2. UPDATED_AT FOR REPAIR COSTS
-- ---------------------------------------------------------

create or replace function
public.set_repair_cost_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists
trg_repair_cost_updated_at
on public.repair_request_costs;

create trigger
trg_repair_cost_updated_at
before update on public.repair_request_costs
for each row
execute function public.set_repair_cost_updated_at();


-- ---------------------------------------------------------
-- 3. AUTOMATIC PROJECT COST SYNCHRONIZATION
--
-- A repair cost is automatically written to the existing
-- project_cost_entries table when a repair request has a project.
--
-- Reference format:
-- AUTO-REPAIR:<repair_request_id>:<repair_cost_id>
-- ---------------------------------------------------------

create or replace function
public.sync_repair_cost_to_project_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id text;
  v_reference_id text;
  v_cost_date date;
begin

  if tg_op = 'DELETE' then

    v_reference_id :=
      'AUTO-REPAIR:' ||
      old.repair_request_id::text ||
      ':' ||
      old.repair_cost_id::text;

    delete from public.project_cost_entries
    where reference_id = v_reference_id;

    return old;
  end if;

  select
    r.project_id,
    r.request_date
  into
    v_project_id,
    v_cost_date
  from public.repair_requests r
  where r.repair_request_id = new.repair_request_id;

  v_reference_id :=
    'AUTO-REPAIR:' ||
    new.repair_request_id::text ||
    ':' ||
    new.repair_cost_id::text;

  -- Remove previous synchronized entry first.
  delete from public.project_cost_entries
  where reference_id = v_reference_id;

  -- A repair without a project should remain a valid
  -- equipment cost record but should not enter project cost.
  if v_project_id is not null then

    insert into public.project_cost_entries (
      project_id,
      cost_date,
      cost_type,
      description,
      quantity,
      unit,
      unit_cost,
      amount,
      reference_id,
      notes
    )
    values (
      v_project_id,
      coalesce(v_cost_date, current_date),
      new.cost_type,
      'Repair Cost - ' || new.description,
      new.quantity,
      new.unit,
      new.unit_cost,
      new.amount,
      v_reference_id,
      coalesce(new.notes, 'Automatically synchronized from AMANAH Repair Request')
    );

  end if;

  return new;
end;
$$;


drop trigger if exists
trg_sync_repair_cost_to_project_cost
on public.repair_request_costs;

create trigger
trg_sync_repair_cost_to_project_cost
after insert or update or delete
on public.repair_request_costs
for each row
execute function public.sync_repair_cost_to_project_cost();


-- ---------------------------------------------------------
-- 4. RESYNC REPAIR COSTS WHEN PROJECT IS CHANGED
-- ---------------------------------------------------------

create or replace function
public.resync_repair_costs_after_project_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
begin

  if coalesce(old.project_id, '') is distinct from coalesce(new.project_id, '') then

    for c in
      select repair_cost_id
      from public.repair_request_costs
      where repair_request_id = new.repair_request_id
    loop

      perform public.sync_one_repair_cost(
        c.repair_cost_id
      );

    end loop;

  end if;

  return new;
end;
$$;


create or replace function
public.sync_one_repair_cost(p_repair_cost_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.repair_request_costs%rowtype;
  r public.repair_requests%rowtype;
  v_reference_id text;
begin

  select *
  into c
  from public.repair_request_costs
  where repair_cost_id = p_repair_cost_id;

  if not found then
    return;
  end if;

  select *
  into r
  from public.repair_requests
  where repair_request_id = c.repair_request_id;

  v_reference_id :=
    'AUTO-REPAIR:' ||
    c.repair_request_id::text ||
    ':' ||
    c.repair_cost_id::text;

  delete from public.project_cost_entries
  where reference_id = v_reference_id;

  if r.project_id is null then
    return;
  end if;

  insert into public.project_cost_entries (
    project_id,
    cost_date,
    cost_type,
    description,
    quantity,
    unit,
    unit_cost,
    amount,
    reference_id,
    notes
  )
  values (
    r.project_id,
    coalesce(r.request_date, current_date),
    c.cost_type,
    'Repair Cost - ' || c.description,
    c.quantity,
    c.unit,
    c.unit_cost,
    c.amount,
    v_reference_id,
    coalesce(c.notes, 'Automatically synchronized from AMANAH Repair Request')
  );
end;
$$;


drop trigger if exists
trg_resync_repair_costs_after_project_change
on public.repair_requests;

create trigger
trg_resync_repair_costs_after_project_change
after update of project_id
on public.repair_requests
for each row
execute function public.resync_repair_costs_after_project_change();


-- ---------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ---------------------------------------------------------

alter table public.repair_request_costs
enable row level security;

drop policy if exists
"authenticated users can read repair costs"
on public.repair_request_costs;

drop policy if exists
"authenticated users can insert repair costs"
on public.repair_request_costs;

drop policy if exists
"authenticated users can update repair costs"
on public.repair_request_costs;

drop policy if exists
"authenticated users can delete repair costs"
on public.repair_request_costs;

create policy
"authenticated users can read repair costs"
on public.repair_request_costs
for select
to authenticated
using (true);

create policy
"authenticated users can insert repair costs"
on public.repair_request_costs
for insert
to authenticated
with check (auth.uid() is not null);

create policy
"authenticated users can update repair costs"
on public.repair_request_costs
for update
to authenticated
using (true)
with check (auth.uid() is not null);

create policy
"authenticated users can delete repair costs"
on public.repair_request_costs
for delete
to authenticated
using (true);


-- ---------------------------------------------------------
-- 6. REPAIR REQUEST SUMMARY VIEW
-- ADD ACTUAL REPAIR COST TOTALS
-- ---------------------------------------------------------

create or replace view
public.repair_request_summary
with (security_invoker = true)
as
select
  r.repair_request_id,
  r.repair_form_no,
  r.request_date,
  r.created_at,
  r.updated_at,

  r.equipment_id,
  e.equipment_name,
  e.equipment_type,
  e.plate_number,

  r.project_id,
  p.project_name,

  r.reported_by,
  r.status,
  r.problems_encountered,

  r.reviewer_evidence_reviewed,
  r.approver_evidence_reviewed,

  r.prepared_at,
  r.reviewed_at,
  r.approved_at,

  r.repair_date_started,
  r.repair_date_completed,

  coalesce((
    select sum(c.amount)
    from public.repair_request_costs c
    where c.repair_request_id = r.repair_request_id
  ), 0)::numeric(15,2) as repair_cost_total,

  coalesce((
    select sum(c.amount)
    from public.repair_request_costs c
    where c.repair_request_id = r.repair_request_id
      and c.cost_type = 'LABOR'
  ), 0)::numeric(15,2) as repair_labor_cost,

  coalesce((
    select sum(c.amount)
    from public.repair_request_costs c
    where c.repair_request_id = r.repair_request_id
      and c.cost_type = 'MATERIAL'
  ), 0)::numeric(15,2) as repair_material_cost,

  coalesce((
    select sum(c.amount)
    from public.repair_request_costs c
    where c.repair_request_id = r.repair_request_id
      and c.cost_type = 'OTHER'
  ), 0)::numeric(15,2) as repair_other_cost,

  (
    select count(*)
    from public.repair_request_photos ph
    where ph.repair_request_id = r.repair_request_id
  ) as photo_count

from public.repair_requests r

left join public.equipment e
  on e.equipment_id = r.equipment_id

left join public.projects p
  on p.project_id = r.project_id;


-- ---------------------------------------------------------
-- 7. EQUIPMENT REPAIR HISTORY
-- One row per repair request
-- ---------------------------------------------------------

create or replace view
public.equipment_repair_history
with (security_invoker = true)
as
select

  r.repair_request_id,
  r.repair_form_no,
  r.request_date,

  r.equipment_id,
  e.equipment_name,
  e.equipment_type,
  e.plate_number,

  r.project_id,
  p.project_name,

  r.reported_by,
  r.problems_encountered,
  r.status,

  r.repaired_by,
  r.repair_date_started,
  r.repair_date_completed,
  r.received_at,

  coalesce((
    select sum(c.amount)
    from public.repair_request_costs c
    where c.repair_request_id = r.repair_request_id
  ), 0)::numeric(15,2) as total_repair_cost,

  coalesce((
    select sum(c.amount)
    from public.repair_request_costs c
    where c.repair_request_id = r.repair_request_id
      and c.cost_type = 'LABOR'
  ), 0)::numeric(15,2) as labor_cost,

  coalesce((
    select sum(c.amount)
    from public.repair_request_costs c
    where c.repair_request_id = r.repair_request_id
      and c.cost_type = 'MATERIAL'
  ), 0)::numeric(15,2) as material_cost,

  coalesce((
    select sum(c.amount)
    from public.repair_request_costs c
    where c.repair_request_id = r.repair_request_id
      and c.cost_type = 'OTHER'
  ), 0)::numeric(15,2) as other_cost,

  (
    select count(*)
    from public.repair_request_photos ph
    where ph.repair_request_id = r.repair_request_id
  ) as total_photos,

  (
    select count(*)
    from public.repair_request_photos ph
    where ph.repair_request_id = r.repair_request_id
      and ph.photo_category = 'PM FINDING'
  ) as pm_finding_photos,

  (
    select count(*)
    from public.repair_request_photos ph
    where ph.repair_request_id = r.repair_request_id
      and ph.photo_category = 'REPAIR BEFORE'
  ) as before_photos,

  (
    select count(*)
    from public.repair_request_photos ph
    where ph.repair_request_id = r.repair_request_id
      and ph.photo_category = 'REPAIR DURING'
  ) as during_photos,

  (
    select count(*)
    from public.repair_request_photos ph
    where ph.repair_request_id = r.repair_request_id
      and ph.photo_category = 'REPAIR AFTER'
  ) as after_photos,

  r.created_at,
  r.updated_at

from public.repair_requests r

left join public.equipment e
  on e.equipment_id = r.equipment_id

left join public.projects p
  on p.project_id = r.project_id;


-- ---------------------------------------------------------
-- 8. EQUIPMENT MAINTENANCE SUMMARY
-- One row per equipment
-- ---------------------------------------------------------

create or replace view
public.equipment_maintenance_summary
with (security_invoker = true)
as
select

  e.equipment_id,
  e.equipment_name,
  e.equipment_type,
  e.plate_number,
  e.status,

  count(r.repair_request_id) as total_repair_requests,

  count(r.repair_request_id)
    filter (where r.status = 'CLOSED')
    as closed_repairs,

  count(r.repair_request_id)
    filter (
      where r.status not in ('CLOSED')
    )
    as open_repairs,

  coalesce(sum(
    case
      when r.repair_request_id is not null
      then (
        select coalesce(sum(c.amount),0)
        from public.repair_request_costs c
        where c.repair_request_id = r.repair_request_id
      )
      else 0
    end
  ),0)::numeric(15,2) as total_repair_cost,

  max(r.repair_date_completed) as last_repair_completed

from public.equipment e

left join public.repair_requests r
  on r.equipment_id = e.equipment_id

group by
  e.equipment_id,
  e.equipment_name,
  e.equipment_type,
  e.plate_number,
  e.status;


-- ---------------------------------------------------------
-- 9. BACKFILL EXISTING REPAIR COSTS IF ANY
-- ---------------------------------------------------------

do $$
declare
  c record;
begin
  for c in
    select repair_cost_id
    from public.repair_request_costs
  loop
    perform public.sync_one_repair_cost(c.repair_cost_id);
  end loop;
end;
$$;
