-- Financial close requires certified completion and settled ordinary billing/advance balances.
-- Retention may then be separately released using payment_kind='RETENTION'.
create or replace function public.amanah_lump_close(p_id uuid)
returns void language plpgsql security definer set search_path=public as $fn$
declare v_max numeric; v_advance numeric; v_recovered numeric; v_net numeric; v_billing_paid numeric;
begin
 if not public.amanah_lump_can('CLOSE') then
   raise exception 'GM approval required to close contracts';
 end if;
 perform 1 from public.amanah_lump_contracts where id=p_id and status='ACTIVE' for update;
 if not found then raise exception 'Only active contracts can be closed';end if;
 select coalesce(max(cumulative_pct),0),
        coalesce(sum(advance_recovery),0),
        coalesce(sum(payable_amount),0)
 into v_max,v_recovered,v_net
 from public.amanah_lump_billings where contract_id=p_id and status='APPROVED';
 if v_max<100 then raise exception 'Contract requires 100 percent certified accomplishment';end if;
 if exists(select 1 from public.amanah_lump_billings
           where contract_id=p_id and status in ('SUBMITTED','VERIFIED')) then
   raise exception 'Resolve pending billings before closing contract';
 end if;
 if exists(select 1 from public.amanah_lump_variations
           where contract_id=p_id and status='SUBMITTED') then
   raise exception 'Resolve pending variation orders before closing contract';
 end if;
 select coalesce(sum(amount),0) into v_advance from public.amanah_lump_payments
   where contract_id=p_id and payment_kind='ADVANCE';
 select coalesce(sum(amount),0) into v_billing_paid from public.amanah_lump_payments
   where contract_id=p_id and payment_kind='BILLING';
 if v_advance-v_recovered>0.005 then
   raise exception 'Unrecovered advance remains: %',round(v_advance-v_recovered,2);
 end if;
 if v_net-v_billing_paid>0.005 then
   raise exception 'Unpaid certified billings remain: %',round(v_net-v_billing_paid,2);
 end if;
 update public.amanah_lump_contracts set status='CLOSED',
   closed_by=auth.uid(),closed_at=now() where id=p_id;
end $fn$;
revoke all on function public.amanah_lump_close(uuid) from public,anon;
grant execute on function public.amanah_lump_close(uuid) to authenticated;
