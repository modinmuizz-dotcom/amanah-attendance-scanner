
create table if not exists public.payroll_group_items (
  payroll_group_item_id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(payroll_run_id) on delete cascade,
  group_name text not null,
  activity_description text,
  rate_per_meter numeric(14,2) not null check (rate_per_meter >= 0),
  meters_accomplished numeric(14,2) not null check (meters_accomplished >= 0),
  gross_pay numeric(14,2) not null check (gross_pay >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_group_items_run
  on public.payroll_group_items(payroll_run_id);

grant select, insert on public.payroll_group_items to authenticated;
