-- AMANAH PAYROLL MODULE
-- Payroll runs snapshot employee rates and attendance-derived work data.
-- TRUCKERS are paid by hour.
-- All other departments are paid by day; HALF DAY is calculated as 50% of the daily rate.

create table if not exists public.payroll_runs (
  payroll_run_id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  status text not null default 'DRAFT',
  total_gross numeric(14,2) not null default 0,
  employee_count integer not null default 0,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payroll_runs_period_check check (period_end >= period_start),
  constraint payroll_runs_status_check check (status in ('DRAFT','POSTED','VOID'))
);

create table if not exists public.payroll_items (
  payroll_item_id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(payroll_run_id) on delete cascade,
  employee_id text not null,
  employee_name text not null,
  department text,
  rate_type text not null,
  rate numeric(14,2) not null default 0,
  attendance_days numeric(10,2) not null default 0,
  full_days numeric(10,2) not null default 0,
  half_days numeric(10,2) not null default 0,
  total_hours numeric(12,2) not null default 0,
  gross_pay numeric(14,2) not null default 0,
  attendance_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint payroll_items_rate_type_check check (rate_type in ('HOURLY','DAILY')),
  constraint payroll_items_days_check check (
    full_days >= 0 and
    half_days >= 0 and
    attendance_days >= 0 and
    full_days + half_days <= attendance_days + 0.0001
  )
);

create index if not exists payroll_runs_period_idx
  on public.payroll_runs(period_start, period_end);

create index if not exists payroll_items_run_idx
  on public.payroll_items(payroll_run_id);

create index if not exists payroll_items_employee_idx
  on public.payroll_items(employee_id);

alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;

drop policy if exists payroll_runs_authenticated_select on public.payroll_runs;
create policy payroll_runs_authenticated_select
  on public.payroll_runs
  for select
  to authenticated
  using (true);

drop policy if exists payroll_runs_authenticated_insert on public.payroll_runs;
create policy payroll_runs_authenticated_insert
  on public.payroll_runs
  for insert
  to authenticated
  with check (true);

drop policy if exists payroll_runs_authenticated_update on public.payroll_runs;
create policy payroll_runs_authenticated_update
  on public.payroll_runs
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists payroll_items_authenticated_select on public.payroll_items;
create policy payroll_items_authenticated_select
  on public.payroll_items
  for select
  to authenticated
  using (true);

drop policy if exists payroll_items_authenticated_insert on public.payroll_items;
create policy payroll_items_authenticated_insert
  on public.payroll_items
  for insert
  to authenticated
  with check (true);

drop policy if exists payroll_items_authenticated_update on public.payroll_items;
create policy payroll_items_authenticated_update
  on public.payroll_items
  for update
  to authenticated
  using (true)
  with check (true);