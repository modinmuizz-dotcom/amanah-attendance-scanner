-- Read-only reconciliation against saved project expenses and payment postings.
begin read only;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(
 select auth_user_id from public.amanah_user_roles order by auth_user_id limit 1
))::text,true);
do $$
begin
 if auth.uid() is null then raise exception 'An existing authenticated account is required.'; end if;
 if exists(
  select 1 from public.get_dashboard_project_cost_chart() c
  left join lateral(select coalesce(sum(e.amount),0) as amount from public.project_cost_entries e where e.project_id=c.project_id) e on true
  where c.actual_cost is distinct from e.amount
 ) then raise exception 'The dashboard and project ledger totals do not reconcile.'; end if;
 if exists(select 1 from public.project_cost_entries e where not exists(select 1 from public.projects p where p.project_id=e.project_id)) then
  raise exception 'A cost entry has no matching project and cannot appear in the project chart.';
 end if;
 if exists(
  select 1 from public.amanah_lump_payments pay join public.amanah_lump_contracts c on c.id=pay.contract_id
  left join public.project_cost_entries e on e.reference_id='LUMP-SUM:PAYMENT:'||pay.id::text
  where e.id is null or e.project_id<>c.project_id or e.cost_type<>'LABOR' or e.amount<>round(pay.amount,2) or e.cost_date<>pay.paid_on
 ) then raise exception 'A lump-sum payment is missing its exact project-cost posting.'; end if;
 if exists(
  select reference_id from public.project_cost_entries where reference_id like 'LUMP-SUM:PAYMENT:%' group by reference_id having count(*)>1
 ) then raise exception 'A lump-sum payment was posted more than once.'; end if;
 if exists(
  select 1 from public.project_cost_entries e join public.amanah_lump_billings b on e.reference_id='LUMP-SUM:'||b.id::text
 ) then raise exception 'An approval-based billing cost remains in the paid-only ledger.'; end if;
 if not exists(
  select 1 from pg_trigger where tgrelid='public.amanah_lump_payments'::regclass
  and tgname='trg_lump_post_actual_payment_cost' and tgenabled<>'D'
 ) then raise exception 'Automatic actual-payment posting is not enabled.'; end if;
end $$;
select count(*) as project_cost_entries,coalesce(sum(amount),0) as recorded_project_cost from public.project_cost_entries;
rollback;
select 'Read-only project chart, ledger, paid lump-sum references, duplicate prevention and posting-trigger reconciliation passed.' as validation;
