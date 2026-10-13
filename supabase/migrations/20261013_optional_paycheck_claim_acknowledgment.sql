-- Make paycheck acknowledgment/receipt notes optional.
-- Keep payment reference reservation, approval gating and duplicate-payment protection.
begin;
alter table public.payroll_paycheck_claims
  alter column acknowledgment drop not null;

create or replace function public.amanah_payroll_record_claim(
 p_run_id uuid,p_item_type text,p_item_id uuid,p_recipient text,
 p_payment_method text,p_reference text,p_ack text,p_paid_on date
)
returns uuid
language plpgsql
security definer
set search_path=public
as $fn$
declare
 v_status text;
 v_employee_item uuid;
 v_group_item uuid;
 v_gross numeric;
 v_claim_id uuid;
 v_reserved public.payroll_payment_reference_reservations%rowtype;
begin
 if auth.uid() is null or not public.amanah_payroll_can_release() then
   raise exception 'Only an authorized cashier/Payroll Officer may record paycheck release';
 end if;
 select status into v_status from public.payroll_runs
   where payroll_run_id=p_run_id for update;
 if v_status is distinct from 'APPROVED' then
   raise exception 'Paychecks are locked until Financial Manager approval';
 end if;
 if nullif(btrim(coalesce(p_reference,'')),'') is null
    or nullif(btrim(coalesce(p_recipient,'')),'') is null
    or p_paid_on is null
    or p_payment_method not in ('CASH','CHECK','BANK TRANSFER','OTHER') then
   raise exception 'Recipient, date, payment method and automatic payment reference are required';
 end if;

 select * into v_reserved
 from public.payroll_payment_reference_reservations
 where reference=p_reference for update;
 if not found or v_reserved.used_at is not null
   or v_reserved.payroll_run_id<>p_run_id
   or v_reserved.item_type<>p_item_type
   or v_reserved.item_id<>p_item_id
   or v_reserved.reserved_by<>auth.uid() then
   raise exception 'This payment reference is not valid for the selected paycheck. Reopen the form to generate one';
 end if;

 if p_item_type='EMPLOYEE' then
   select payroll_item_id,gross_pay into v_employee_item,v_gross
   from public.payroll_items
   where payroll_item_id=p_item_id and payroll_run_id=p_run_id;
   if not found then raise exception 'Employee paycheck does not belong to this payroll';end if;
 elsif p_item_type='GROUP' then
   select payroll_group_item_id,gross_pay into v_group_item,v_gross
   from public.payroll_group_items
   where payroll_group_item_id=p_item_id and payroll_run_id=p_run_id;
   if not found then raise exception 'Group Labor payment does not belong to this payroll';end if;
 else raise exception 'Invalid paycheck type';end if;
 if v_gross<=0 then raise exception 'Paycheck has no payable amount';end if;

 insert into public.payroll_paycheck_claims(
   payroll_run_id,payroll_item_id,payroll_group_item_id,recipient_name,
   amount,released_on,payment_method,payment_reference,acknowledgment,released_by
 ) values(
   p_run_id,v_employee_item,v_group_item,btrim(p_recipient),
   round(v_gross,2),p_paid_on,p_payment_method,
   v_reserved.reference,nullif(btrim(coalesce(p_ack,'')),''),auth.uid()
 ) returning id into v_claim_id;

 update public.payroll_payment_reference_reservations
 set claimed_id=v_claim_id,used_at=now()
 where reference=v_reserved.reference;
 return v_claim_id;
end
$fn$;
commit;