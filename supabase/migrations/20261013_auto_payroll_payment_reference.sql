-- Automatic AMANAH internal payroll-payment references.
-- Reservations let the form show the actual server-issued reference before release.
-- Only an approved and unpaid paycheck can reserve and consume a number.
begin;

create sequence if not exists public.amanah_payroll_claim_reference_seq as bigint start with 1;
revoke all on sequence public.amanah_payroll_claim_reference_seq from public,anon,authenticated;

create table if not exists public.payroll_payment_reference_reservations (
  reference text primary key,
  payroll_run_id uuid not null references public.payroll_runs(payroll_run_id) on delete restrict,
  item_type text not null check (item_type in ('EMPLOYEE','GROUP')),
  item_id uuid not null,
  reserved_by uuid not null,
  reserved_at timestamptz not null default now(),
  claimed_id uuid unique references public.payroll_paycheck_claims(id) on delete restrict,
  used_at timestamptz,
  constraint claim_reference_reservation_used_consistency check(
    (claimed_id is null and used_at is null) or
    (claimed_id is not null and used_at is not null)
  )
);
create unique index if not exists uq_payroll_active_reference_by_recipient
on public.payroll_payment_reference_reservations (payroll_run_id,item_type,item_id,reserved_by)
where used_at is null;

alter table public.payroll_payment_reference_reservations enable row level security;
revoke all on public.payroll_payment_reference_reservations from public,anon,authenticated;

-- Cross-payroll uniqueness is important: every receipt needs its own number.
create unique index if not exists uq_payroll_claim_reference_global
  on public.payroll_paycheck_claims(payment_reference);

create or replace function public.amanah_payroll_generate_payment_reference(
 p_run_id uuid,p_item_type text,p_item_id uuid
)
returns text
language plpgsql
security definer
set search_path=public
as $fn$
declare
 v_status text;
 v_existing text;
 v_number bigint;
 v_reference text;
begin
 if auth.uid() is null or not public.amanah_payroll_can_release() then
   raise exception 'Only authorized Payroll staff may generate a paycheck reference';
 end if;
 -- Run locking serializes reservation with paycheck release.
 select status into v_status from public.payroll_runs
 where payroll_run_id=p_run_id for update;
 if v_status is distinct from 'APPROVED' then
   raise exception 'Payment references can only be issued for approved payroll';
 end if;
 if p_item_type='EMPLOYEE' then
   if not exists(select 1 from public.payroll_items
     where payroll_item_id=p_item_id and payroll_run_id=p_run_id and gross_pay>0)
   then raise exception 'Employee paycheck not found';end if;
   if exists(select 1 from public.payroll_paycheck_claims
      where payroll_item_id=p_item_id)
   then raise exception 'This paycheck has already been claimed';end if;
 elsif p_item_type='GROUP' then
   if not exists(select 1 from public.payroll_group_items
     where payroll_group_item_id=p_item_id and payroll_run_id=p_run_id and gross_pay>0)
   then raise exception 'Group Labor paycheck not found';end if;
   if exists(select 1 from public.payroll_paycheck_claims
      where payroll_group_item_id=p_item_id)
   then raise exception 'This Group Labor payment has already been claimed';end if;
 else raise exception 'Invalid paycheck type';end if;

 -- Reopening the form uses the existing unused reference for this account.
 select reference into v_existing
 from public.payroll_payment_reference_reservations
 where payroll_run_id=p_run_id and item_type=p_item_type
   and item_id=p_item_id and reserved_by=auth.uid() and used_at is null
 limit 1 for update;
 if found then return v_existing;end if;

 v_number:=nextval('public.amanah_payroll_claim_reference_seq'::regclass);
 v_reference:='PAY-'||
   to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||
   '-'||lpad(v_number::text,greatest(6,length(v_number::text)),'0');

 insert into public.payroll_payment_reference_reservations
 (reference,payroll_run_id,item_type,item_id,reserved_by)
 values(v_reference,p_run_id,p_item_type,p_item_id,auth.uid());
 return v_reference;
end
$fn$;

-- Preserve the existing API signature but require a server-issued reservation.
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
    or nullif(btrim(coalesce(p_ack,'')),'') is null
    or nullif(btrim(coalesce(p_recipient,'')),'') is null
    or p_paid_on is null
    or p_payment_method not in ('CASH','CHECK','BANK TRANSFER','OTHER') then
   raise exception 'Recipient, date, payment method, auto reference and acknowledgment are required';
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
   v_reserved.reference,btrim(p_ack),auth.uid()
 ) returning id into v_claim_id;

 update public.payroll_payment_reference_reservations
 set claimed_id=v_claim_id,used_at=now()
 where reference=v_reserved.reference;
 return v_claim_id;
end
$fn$;

revoke all on function public.amanah_payroll_generate_payment_reference(uuid,text,uuid)
 from public,anon;
grant execute on function public.amanah_payroll_generate_payment_reference(uuid,text,uuid)
 to authenticated;
revoke all on function public.amanah_payroll_record_claim(uuid,text,uuid,text,text,text,text,date)
 from public,anon;
grant execute on function public.amanah_payroll_record_claim(uuid,text,uuid,text,text,text,text,date)
 to authenticated;
commit;