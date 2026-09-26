-- =========================================================
-- AMANAH PROJECT COST SECURITY
-- Run after creating project_budgets, project_cost_entries,
-- and project_cost_summary.
-- =========================================================

-- Enable Row Level Security.
alter table public.project_budgets enable row level security;
alter table public.project_cost_entries enable row level security;

-- Remove old policies with these names if they already exist.
drop policy if exists "authenticated users can read project budgets"
on public.project_budgets;

drop policy if exists "authenticated users can insert project budgets"
on public.project_budgets;

drop policy if exists "authenticated users can update project budgets"
on public.project_budgets;

drop policy if exists "authenticated users can delete project budgets"
on public.project_budgets;

drop policy if exists "authenticated users can read project costs"
on public.project_cost_entries;

drop policy if exists "authenticated users can insert project costs"
on public.project_cost_entries;

drop policy if exists "authenticated users can update project costs"
on public.project_cost_entries;

drop policy if exists "authenticated users can delete project costs"
on public.project_cost_entries;

-- PROJECT BUDGETS
create policy "authenticated users can read project budgets"
on public.project_budgets
for select
to authenticated
using (true);

create policy "authenticated users can insert project budgets"
on public.project_budgets
for insert
to authenticated
with check (true);

create policy "authenticated users can update project budgets"
on public.project_budgets
for update
to authenticated
using (true)
with check (true);

create policy "authenticated users can delete project budgets"
on public.project_budgets
for delete
to authenticated
using (true);

-- PROJECT COST ENTRIES
create policy "authenticated users can read project costs"
on public.project_cost_entries
for select
to authenticated
using (true);

create policy "authenticated users can insert project costs"
on public.project_cost_entries
for insert
to authenticated
with check (true);

create policy "authenticated users can update project costs"
on public.project_cost_entries
for update
to authenticated
using (true)
with check (true);

create policy "authenticated users can delete project costs"
on public.project_cost_entries
for delete
to authenticated
using (true);

-- The view was already changed to SECURITY INVOKER.
alter view public.project_cost_summary
set (security_invoker = true);
