-- Restrict sensitive contract amounts and evidence to authorized payroll and review roles.
create or replace function public.amanah_lump_can_view()
returns boolean language sql stable security definer set search_path=public as $fn$
 select public.amanah_lump_can('CREATE')
    or public.amanah_lump_can('VERIFY')
    or public.amanah_lump_can('APPROVE')
    or public.amanah_lump_can('PAY')
    or public.amanah_has_permission('payroll.view');
$fn$;
revoke all on function public.amanah_lump_can_view() from public,anon;
grant execute on function public.amanah_lump_can_view() to authenticated;

drop policy if exists lump_contract_read on public.amanah_lump_contracts;
create policy lump_contract_read on public.amanah_lump_contracts
 for select to authenticated using ((select public.amanah_lump_can_view()));
drop policy if exists lump_variations_read on public.amanah_lump_variations;
create policy lump_variations_read on public.amanah_lump_variations
 for select to authenticated using ((select public.amanah_lump_can_view()));
drop policy if exists lump_billings_read on public.amanah_lump_billings;
create policy lump_billings_read on public.amanah_lump_billings
 for select to authenticated using ((select public.amanah_lump_can_view()));
drop policy if exists lump_payments_read on public.amanah_lump_payments;
create policy lump_payments_read on public.amanah_lump_payments
 for select to authenticated using ((select public.amanah_lump_can_view()));

drop policy if exists "amanah_lump_evidence_read" on storage.objects;
create policy "amanah_lump_evidence_read" on storage.objects
for select to authenticated
using(bucket_id='amanah-lump-evidence' and (select public.amanah_lump_can_view()));
