-- Safely delete only DRAFT payroll runs and all their draft entries.
-- Submitted, approved, rejected and paid payroll are financial records and
-- cannot be erased through the Payroll UI.
create or replace function public.amanah_payroll_delete_draft(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $fn$
declare
  v_status text;
begin
  if auth.uid() is null or not public.amanah_payroll_can_prepare() then
    raise exception 'Only authorized Payroll Officers may delete draft payroll';
  end if;
  select status into v_status
  from public.payroll_runs
  where payroll_run_id=p_run_id for update;
  if not found then raise exception 'Payroll not found or already deleted'; end if;
  if v_status <> 'DRAFT' then
    raise exception 'Deletion is allowed for Draft payroll only. % payroll must be preserved for approval and payment auditing', v_status;
  end if;
  if exists(select 1 from public.payroll_approval_decisions where payroll_run_id=p_run_id)
    or exists(select 1 from public.payroll_paycheck_claims where payroll_run_id=p_run_id) then
    raise exception 'Payroll has approval or payment records and cannot be deleted';
  end if;
  -- The group-cost trigger removes any accidental legacy draft cost entries.
  -- Delete child rows before the header so draft-guard triggers can still
  -- lock and verify the parent run.
  delete from public.payroll_group_items where payroll_run_id=p_run_id;
  delete from public.payroll_items where payroll_run_id=p_run_id;
  delete from public.payroll_runs where payroll_run_id=p_run_id and status='DRAFT';
  if not found then raise exception 'Payroll changed status before deletion'; end if;
end
$fn$;
revoke all on function public.amanah_payroll_delete_draft(uuid) from public,anon;
grant execute on function public.amanah_payroll_delete_draft(uuid) to authenticated;
