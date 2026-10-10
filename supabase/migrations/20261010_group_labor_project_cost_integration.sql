-- AMANAH Group Labor: link each group payment to a project and its LABOR expense.
-- A saved DRAFT/POSTED payroll run creates precisely one linked cost per group item.
-- VOID payroll runs remove their linked group costs.
-- Updates/deletes of group items synchronize/remove those costs automatically.
-- The cost is NOT recorded when adding an unsaved preview row in the browser.

begin;

alter table public.payroll_group_items
  add column if not exists project_id text;

-- There were no existing group items at the time of this migration.
-- Keep the project mandatory for all new group labor payroll items.
alter table public.payroll_group_items
  alter column project_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.payroll_group_items'::regclass
      and conname='payroll_group_items_project_id_fkey'
  ) then
    alter table public.payroll_group_items
      add constraint payroll_group_items_project_id_fkey
      foreign key (project_id) references public.projects(project_id)
      on update cascade on delete restrict;
  end if;
end;
$$;

create index if not exists idx_payroll_group_items_project_id
  on public.payroll_group_items(project_id);

-- Prevent duplicate postings for the same source payroll group item.
create unique index if not exists uq_project_cost_group_labor_source
  on public.project_cost_entries(reference_id)
  where reference_id like 'GROUP-LABOR:%';

-- Managed expense records must follow payroll, not manual edits/deletes.
create or replace function public.guard_payroll_generated_project_cost()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_managed boolean;
begin
  if tg_op='INSERT' then
    v_managed := coalesce(new.reference_id like 'GROUP-LABOR:%',false);
  elsif tg_op='DELETE' then
    v_managed := coalesce(old.reference_id like 'GROUP-LABOR:%',false);
  else
    v_managed := coalesce(old.reference_id like 'GROUP-LABOR:%',false)
      or coalesce(new.reference_id like 'GROUP-LABOR:%',false);
  end if;

  if v_managed and pg_trigger_depth() <= 1 then
    raise exception 'This LABOR expense is linked to Group Labor Payroll and cannot be changed or deleted directly.'
      using errcode='23514';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$fn$;

drop trigger if exists trg_guard_payroll_generated_project_cost
  on public.project_cost_entries;
create trigger trg_guard_payroll_generated_project_cost
  before insert or update or delete on public.project_cost_entries
  for each row execute function public.guard_payroll_generated_project_cost();

-- Reconcile cost for one saved group labor item. Fully transactional with payroll insert.
create or replace function public.sync_payroll_group_cost(p_group_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_reference text := 'GROUP-LABOR:' || p_group_item_id::text;
begin
  select
    g.payroll_group_item_id, g.project_id,
    g.group_name, g.activity_description,
    g.meters_accomplished, g.rate_per_meter, g.gross_pay,
    pr.period_start, pr.period_end, pr.status as payroll_status
  into r
  from public.payroll_group_items g
  join public.payroll_runs pr on pr.payroll_run_id=g.payroll_run_id
  where g.payroll_group_item_id=p_group_item_id;

  if not found then
    delete from public.project_cost_entries
      where reference_id=v_reference;
    return;
  end if;

  if upper(r.payroll_status)='VOID' then
    delete from public.project_cost_entries
      where reference_id=v_reference;
    return;
  end if;

  insert into public.project_cost_entries (
    project_id, cost_date, cost_type, description, quantity, unit,
    unit_cost, amount, reference_id, notes
  )
  values (
    r.project_id, r.period_end, 'LABOR',
    'GROUP LABOR: ' || r.group_name ||
      case when nullif(btrim(coalesce(r.activity_description,'')),'') is not null
        then ' - ' || btrim(r.activity_description) else '' end,
    r.meters_accomplished, 'METER',
    r.rate_per_meter, r.gross_pay,
    v_reference,
    'Automatically linked to Group Labor Payroll; payroll period ' ||
      r.period_start::text || ' to ' || r.period_end::text
  )
  on conflict (reference_id) where (reference_id like 'GROUP-LABOR:%')
  do update set
    project_id=excluded.project_id,
    cost_date=excluded.cost_date,
    cost_type='LABOR',
    description=excluded.description,
    quantity=excluded.quantity,
    unit='METER',
    unit_cost=excluded.unit_cost,
    amount=excluded.amount,
    notes=excluded.notes;
end;
$fn$;

revoke all on function public.sync_payroll_group_cost(uuid) from public, anon, authenticated;

create or replace function public.trg_sync_payroll_group_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op='DELETE' then
    delete from public.project_cost_entries
      where reference_id='GROUP-LABOR:' || old.payroll_group_item_id::text;
    return old;
  end if;

  perform public.sync_payroll_group_cost(new.payroll_group_item_id);
  return new;
end;
$fn$;

drop trigger if exists trg_sync_payroll_group_cost on public.payroll_group_items;
create trigger trg_sync_payroll_group_cost
  after insert or update or delete on public.payroll_group_items
  for each row execute function public.trg_sync_payroll_group_cost();

create or replace function public.trg_resync_payroll_run_group_costs()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
begin
  if new.status is distinct from old.status then
    for r in
      select payroll_group_item_id
      from public.payroll_group_items
      where payroll_run_id=new.payroll_run_id
    loop
      perform public.sync_payroll_group_cost(r.payroll_group_item_id);
    end loop;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_resync_payroll_run_group_costs on public.payroll_runs;
create trigger trg_resync_payroll_run_group_costs
  after update of status on public.payroll_runs
  for each row execute function public.trg_resync_payroll_run_group_costs();

comment on column public.payroll_group_items.project_id is
  'Required project used for automatic LABOR expense posting in Project Cost Control.';

commit;