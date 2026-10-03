-- AMANAH mobile identity mapping
-- Additive only: does not modify existing employee, attendance, activity, or scanner tables.

begin;

create table if not exists public.employee_auth_accounts (
  auth_user_id uuid primary key
    references auth.users(id)
    on delete cascade,
  employee_id text not null unique
    references public.employees(employee_id)
    on delete restrict,
  mobile_access_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_auth_accounts_employee_id
  on public.employee_auth_accounts(employee_id);

alter table public.employee_auth_accounts enable row level security;

revoke all on public.employee_auth_accounts from anon;
grant select on public.employee_auth_accounts to authenticated;

drop policy if exists "employee_auth_accounts_select_own" on public.employee_auth_accounts;

create policy "employee_auth_accounts_select_own"
  on public.employee_auth_accounts
  for select
  to authenticated
  using ((select auth.uid()) = auth_user_id);

commit;
