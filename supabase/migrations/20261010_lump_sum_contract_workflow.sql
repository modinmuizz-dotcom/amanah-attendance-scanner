
-- AMANAH Lump-Sum Contracts: direct labor crews and independent subcontractors.
-- Approval workflow and payment ledger. No direct browser mutations to ledger tables.
create table if not exists public.amanah_lump_contracts (
 id uuid primary key default gen_random_uuid(),
 project_id text not null references public.projects(project_id) on update cascade,
 contract_type text not null check(contract_type in ('DIRECT_LABOR','SUBCONTRACTOR')),
 contractor_name text not null,
 scope_title text not null,
 scope_description text not null,
 original_amount numeric(14,2) not null check(original_amount>0),
 advance_limit numeric(14,2) not null default 0 check(advance_limit>=0),
 retention_pct numeric(5,2) not null default 0 check(retention_pct between 0 and 30),
 signed_on date not null default current_date,
 contract_reference text,
 compliance_notes text,
 document_url text,
 status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','CLOSED')),
 created_by uuid not null default auth.uid(),
 activated_by uuid,
 activated_at timestamptz,
 closed_by uuid,
 closed_at timestamptz,
 created_at timestamptz not null default now(),
 constraint amanah_lump_advance_not_exceed check(advance_limit<=original_amount)
);
create index if not exists idx_lump_project on public.amanah_lump_contracts(project_id);

create table if not exists public.amanah_lump_variations (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.amanah_lump_contracts(id),
 description text not null,
 amount_delta numeric(14,2) not null check(amount_delta<>0),
 evidence_url text,
 status text not null default 'SUBMITTED' check(status in ('SUBMITTED','APPROVED','REJECTED')),
 submitted_by uuid not null default auth.uid(),
 submitted_at timestamptz not null default now(),
 decided_by uuid,
 decided_at timestamptz,
 decision_notes text
);
create index if not exists idx_lump_variations_contract on public.amanah_lump_variations(contract_id);

create table if not exists public.amanah_lump_billings (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.amanah_lump_contracts(id),
 milestone text not null,
 cumulative_pct numeric(7,3) not null check(cumulative_pct>0 and cumulative_pct<=100),
 gross_amount numeric(14,2) not null check(gross_amount>0),
 retention_amount numeric(14,2) not null default 0 check(retention_amount>=0),
 advance_recovery numeric(14,2) not null default 0 check(advance_recovery>=0),
 tax_withheld numeric(14,2) not null default 0 check(tax_withheld>=0),
 payable_amount numeric(14,2) not null check(payable_amount>=0),
 evidence_url text not null,
 description text,
 status text not null default 'SUBMITTED' check(status in ('SUBMITTED','VERIFIED','APPROVED','REJECTED')),
 created_by uuid not null default auth.uid(),
 submitted_at timestamptz not null default now(),
 verified_by uuid,
 verified_at timestamptz,
 verification_notes text,
 decided_by uuid,
 decided_at timestamptz,
 decision_notes text,
 constraint lump_deductions_not_above_gross check (retention_amount+advance_recovery+tax_withheld <= gross_amount)
);
create index if not exists idx_lump_billings_contract on public.amanah_lump_billings(contract_id);

create table if not exists public.amanah_lump_payments (
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.amanah_lump_contracts(id),
 billing_id uuid references public.amanah_lump_billings(id),
 payment_kind text not null check(payment_kind in ('ADVANCE','BILLING','RETENTION')),
 amount numeric(14,2) not null check(amount>0),
 paid_on date not null,
 payment_method text not null,
 payment_reference text not null,
 recipient_ack text,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 constraint lump_billing_payment_fk check (
    (payment_kind='BILLING' and billing_id is not null)
    or (payment_kind<>'BILLING' and billing_id is null)
 ),
 unique(contract_id,payment_reference)
);
create index if not exists idx_lump_payments_contract on public.amanah_lump_payments(contract_id);

alter table public.amanah_lump_contracts enable row level security;
alter table public.amanah_lump_variations enable row level security;
alter table public.amanah_lump_billings enable row level security;
alter table public.amanah_lump_payments enable row level security;

-- Core-role membership for server-authorized actions. A user may hold more than one role.
create or replace function public.amanah_lump_can(p_action text)
returns boolean language sql stable security definer set search_path=public
as $fn$
  select auth.uid() is not null and exists (
    select 1 from public.amanah_user_roles ur
    join public.amanah_roles r on r.role_id=ur.role_id
    where ur.auth_user_id=auth.uid()
      and (
        upper(r.role_name)='SUPER ADMIN'
        or (p_action='CREATE' and upper(r.role_name) in ('ADMINISTRATOR','HR / PAYROLL','PROJECT MANAGEMENT','GENERAL MANAGER'))
        or (p_action='VERIFY' and upper(r.role_name) in ('SITE ENGINEER','PROJECT MANAGEMENT'))
        or (p_action in ('APPROVE','ACTIVATE','CLOSE','VARIATION') and upper(r.role_name)='GENERAL MANAGER')
        or (p_action='PAY' and upper(r.role_name) in ('HR / PAYROLL','GENERAL MANAGER'))
      )
  );
$fn$;
revoke all on function public.amanah_lump_can(text) from public,anon;
grant execute on function public.amanah_lump_can(text) to authenticated;

create policy lump_contract_read on public.amanah_lump_contracts for select to authenticated
 using ((select auth.uid()) is not null);
create policy lump_variations_read on public.amanah_lump_variations for select to authenticated
 using ((select auth.uid()) is not null);
create policy lump_billings_read on public.amanah_lump_billings for select to authenticated
 using ((select auth.uid()) is not null);
create policy lump_payments_read on public.amanah_lump_payments for select to authenticated
 using ((select auth.uid()) is not null);
grant select on public.amanah_lump_contracts,public.amanah_lump_variations,
  public.amanah_lump_billings,public.amanah_lump_payments to authenticated;
revoke insert,update,delete on public.amanah_lump_contracts,public.amanah_lump_variations,
  public.amanah_lump_billings,public.amanah_lump_payments from anon,authenticated;

create or replace function public.amanah_lump_create(
 p_project_id text, p_contract_type text,p_name text,p_title text,
 p_scope text,p_amount numeric,p_advance numeric,p_retention numeric,
 p_signed_on date,p_reference text,p_compliance text,p_document_url text
) returns uuid language plpgsql security definer set search_path=public
as $fn$
declare v_id uuid;
begin
 if not public.amanah_lump_can('CREATE') then raise exception 'Not authorized to register contracts';end if;
 if p_contract_type not in ('DIRECT_LABOR','SUBCONTRACTOR')
    or nullif(btrim(p_name),'') is null or nullif(btrim(p_title),'') is null
    or nullif(btrim(p_scope),'') is null or p_amount<=0 or p_amount is null
    or p_advance<0 or p_advance>p_amount or p_retention<0 or p_retention>30
    or p_signed_on is null then raise exception 'Invalid contract details'; end if;
 if p_contract_type='DIRECT_LABOR' and nullif(btrim(coalesce(p_compliance,'')),'') is null
    then raise exception 'Direct labor contract requires worker wage and benefits compliance notes';end if;
 if not exists(select 1 from public.projects where project_id=p_project_id) then raise exception 'Project not found';end if;
 insert into public.amanah_lump_contracts(project_id,contract_type,contractor_name,scope_title,
  scope_description,original_amount,advance_limit,retention_pct,signed_on,contract_reference,compliance_notes,document_url)
 values(p_project_id,p_contract_type,btrim(p_name),btrim(p_title),btrim(p_scope),round(p_amount,2),
   round(p_advance,2),round(p_retention,2),p_signed_on,nullif(btrim(p_reference),''),
   nullif(btrim(p_compliance),''),nullif(btrim(p_document_url),''))
 returning id into v_id;
 return v_id;
end $fn$;

create or replace function public.amanah_lump_activate(p_id uuid)
returns void language plpgsql security definer set search_path=public as $fn$
begin
 if not public.amanah_lump_can('ACTIVATE') then raise exception 'GM approval required to activate contracts';end if;
 update public.amanah_lump_contracts set status='ACTIVE',activated_by=auth.uid(),activated_at=now()
 where id=p_id and status='DRAFT';
 if not found then raise exception 'Only draft contracts can be activated';end if;
end $fn$;

create or replace function public.amanah_lump_variation_submit(p_id uuid,p_desc text,p_delta numeric,p_evidence text)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare v_id uuid; v_contract record; v_revised numeric;
begin
 if not public.amanah_lump_can('CREATE') then raise exception 'Not authorized to submit variation';end if;
 select * into v_contract from public.amanah_lump_contracts where id=p_id for update;
 if not found or v_contract.status<>'ACTIVE' then raise exception 'Contract must be active';end if;
 if nullif(btrim(p_desc),'') is null or p_delta=0 or p_delta is null then raise exception 'Variation description and nonzero amount required';end if;
 if exists(select 1 from public.amanah_lump_billings where contract_id=p_id and status in ('SUBMITTED','VERIFIED')) then
   raise exception 'Resolve pending billings before requesting a variation';end if;
 select v_contract.original_amount+coalesce(sum(amount_delta),0) into v_revised
 from public.amanah_lump_variations where contract_id=p_id and status='APPROVED';
 if v_revised+p_delta < (select coalesce(sum(gross_amount),0) from public.amanah_lump_billings where contract_id=p_id and status='APPROVED')
    or v_revised+p_delta<=0 then raise exception 'Variation would reduce the contract below certified work';end if;
 insert into public.amanah_lump_variations(contract_id,description,amount_delta,evidence_url)
 values(p_id,btrim(p_desc),round(p_delta,2),nullif(btrim(p_evidence),''))
 returning id into v_id;
 return v_id;
end $fn$;

create or replace function public.amanah_lump_variation_decide(p_id uuid,p_approve boolean,p_notes text)
returns void language plpgsql security definer set search_path=public as $fn$
declare v record; v_base numeric; v_certified numeric;
begin
 if not public.amanah_lump_can('VARIATION') then raise exception 'GM approval required for variations';end if;
 select * into v from public.amanah_lump_variations where id=p_id for update;
 if not found or v.status<>'SUBMITTED' then raise exception 'Variation is not pending';end if;
 perform 1 from public.amanah_lump_contracts where id=v.contract_id and status='ACTIVE' for update;
 if not found then raise exception 'Contract not active';end if;
 if exists(select 1 from public.amanah_lump_billings where contract_id=v.contract_id and status in ('SUBMITTED','VERIFIED'))
   then raise exception 'Resolve pending billings before approving variation';end if;
 if p_approve then
  select c.original_amount+coalesce((select sum(amount_delta) from public.amanah_lump_variations
     where contract_id=v.contract_id and status='APPROVED'),0) into v_base
     from public.amanah_lump_contracts c where c.id=v.contract_id;
  select coalesce(sum(gross_amount),0) into v_certified from public.amanah_lump_billings
     where contract_id=v.contract_id and status='APPROVED';
  if v_base+v.amount_delta<=0 or v_base+v.amount_delta<v_certified
     then raise exception 'Variation would exceed revised contract constraints';end if;
 elsif nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception 'Rejection reason required';end if;
 update public.amanah_lump_variations
 set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
    decided_by=auth.uid(),decided_at=now(),decision_notes=p_notes
 where id=p_id;
end $fn$;

create or replace function public.amanah_lump_submit_billing(
 p_contract_id uuid,p_milestone text,p_pct numeric,p_evidence text,p_description text,
 p_recovery numeric,p_tax numeric
) returns uuid language plpgsql security definer set search_path=public as $fn$
declare v_c record; v_revised numeric; v_prior numeric; v_pct numeric;
 v_gross numeric; v_ret numeric; v_recovery numeric; v_tax numeric;
 v_advances numeric; v_recovered numeric; v_id uuid;
begin
 if not public.amanah_lump_can('CREATE') then raise exception 'Not authorized to prepare billings';end if;
 select * into v_c from public.amanah_lump_contracts where id=p_contract_id for update;
 if not found or v_c.status<>'ACTIVE' then raise exception 'Contract must be active';end if;
 if p_pct is null or p_pct<=0 or p_pct>100 or nullif(btrim(p_milestone),'') is null
   or nullif(btrim(coalesce(p_evidence,'')),'') is null
    then raise exception 'Valid cumulative accomplishment, milestone and supporting evidence link are required';end if;
 if exists(select 1 from public.amanah_lump_billings where contract_id=p_contract_id and status in ('SUBMITTED','VERIFIED'))
    then raise exception 'Resolve the existing pending billing first';end if;
 select v_c.original_amount+coalesce(sum(amount_delta),0) into v_revised from public.amanah_lump_variations
   where contract_id=p_contract_id and status='APPROVED';
 select coalesce(sum(gross_amount),0),coalesce(max(cumulative_pct),0)
 into v_prior,v_pct from public.amanah_lump_billings where contract_id=p_contract_id and status='APPROVED';
 if p_pct<=v_pct then raise exception 'Cumulative accomplishment must exceed previously certified percentage %',v_pct;end if;
 v_gross:=round(v_revised*p_pct/100,2)-v_prior;
 if v_gross<=0 then raise exception 'No additional earned amount to bill';end if;
 v_ret:=round(v_gross*v_c.retention_pct/100,2);
 v_recovery:=round(coalesce(p_recovery,0),2);
 v_tax:=round(coalesce(p_tax,0),2);
 select coalesce(sum(amount),0) into v_advances from public.amanah_lump_payments where contract_id=p_contract_id and payment_kind='ADVANCE';
 select coalesce(sum(advance_recovery),0) into v_recovered from public.amanah_lump_billings where contract_id=p_contract_id and status='APPROVED';
 if v_recovery<0 or v_recovery>v_advances-v_recovered then raise exception 'Advance recovery exceeds unrecovered paid advances';end if;
 if v_tax<0 or v_tax+v_ret+v_recovery>v_gross then raise exception 'Withholding/deductions exceed current gross billing';end if;
 insert into public.amanah_lump_billings(contract_id,milestone,cumulative_pct,gross_amount,
   retention_amount,advance_recovery,tax_withheld,payable_amount,evidence_url,description)
 values(p_contract_id,btrim(p_milestone),p_pct,v_gross,v_ret,v_recovery,v_tax,
   v_gross-v_ret-v_recovery-v_tax,btrim(p_evidence),nullif(btrim(p_description),''))
 returning id into v_id;
 return v_id;
end $fn$;

create or replace function public.amanah_lump_verify(p_id uuid,p_notes text)
returns void language plpgsql security definer set search_path=public as $fn$
begin
 if not public.amanah_lump_can('VERIFY') then raise exception 'Site Engineer or Project Management verification required';end if;
 update public.amanah_lump_billings set status='VERIFIED',verified_by=auth.uid(),verified_at=now(),
 verification_notes=nullif(btrim(p_notes),'') where id=p_id and status='SUBMITTED';
 if not found then raise exception 'Only submitted billings can be verified';end if;
end $fn$;

create or replace function public.amanah_lump_decide(p_id uuid,p_approve boolean,p_notes text)
returns void language plpgsql security definer set search_path=public as $fn$
declare v record; v_c record; v_revised numeric; v_prior numeric; v_advances numeric; v_recovered numeric;
begin
 if not public.amanah_lump_can('APPROVE') then raise exception 'GM approval required';end if;
 select b.contract_id into v from public.amanah_lump_billings b where b.id=p_id;
 if not found then raise exception 'Billing not found';end if;
 select * into v_c from public.amanah_lump_contracts where id=v.contract_id for update;
 select * into v from public.amanah_lump_billings where id=p_id for update;
 if v.status not in ('SUBMITTED','VERIFIED') then raise exception 'Billing already decided';end if;
 if p_approve and v.status<>'VERIFIED' then raise exception 'Site Engineer verification is required before GM approval';end if;
 if not p_approve and nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception 'Rejection reason required';end if;
 if p_approve then
  select v_c.original_amount+coalesce(sum(amount_delta),0) into v_revised from public.amanah_lump_variations where contract_id=v.contract_id and status='APPROVED';
  select coalesce(sum(gross_amount),0) into v_prior from public.amanah_lump_billings where contract_id=v.contract_id and status='APPROVED';
  if v_prior+v.gross_amount > v_revised+0.01 then raise exception 'Certified amount would exceed revised contract';end if;
  select coalesce(sum(amount),0) into v_advances from public.amanah_lump_payments where contract_id=v.contract_id and payment_kind='ADVANCE';
  select coalesce(sum(advance_recovery),0) into v_recovered from public.amanah_lump_billings where contract_id=v.contract_id and status='APPROVED';
  if v_recovered+v.advance_recovery > v_advances then raise exception 'Advance recovery now exceeds recorded advances';end if;
 end if;
 update public.amanah_lump_billings set
   status=case when p_approve then 'APPROVED' else 'REJECTED' end,
   decided_by=auth.uid(),decided_at=now(),decision_notes=p_notes
 where id=p_id;
end $fn$;

create or replace function public.amanah_lump_close(p_id uuid)
returns void language plpgsql security definer set search_path=public as $fn$
declare v_max numeric;
begin
 if not public.amanah_lump_can('CLOSE') then raise exception 'GM approval required to close contracts';end if;
 perform 1 from public.amanah_lump_contracts where id=p_id and status='ACTIVE' for update;
 if not found then raise exception 'Only active contracts can be closed';end if;
 select coalesce(max(cumulative_pct),0) into v_max from public.amanah_lump_billings
 where contract_id=p_id and status='APPROVED';
 if v_max<100 then raise exception 'Contract requires certified 100%% accomplishment before closure';end if;
 if exists(select 1 from public.amanah_lump_billings where contract_id=p_id and status in ('SUBMITTED','VERIFIED'))
    then raise exception 'Resolve pending billings before closing contract';end if;
 update public.amanah_lump_contracts set status='CLOSED',closed_by=auth.uid(),closed_at=now() where id=p_id;
end $fn$;

create or replace function public.amanah_lump_record_payment(
 p_contract_id uuid,p_billing_id uuid,p_kind text,p_amount numeric,p_paid_on date,
 p_method text,p_reference text,p_ack text
) returns uuid language plpgsql security definer set search_path=public as $fn$
declare v_c record; v_b record; v_paid numeric; v_allowed numeric; v_id uuid;
begin
 if not public.amanah_lump_can('PAY') then raise exception 'Authorized Payroll/Finance or GM user required to record payment';end if;
 if p_amount is null or p_amount<=0 or p_paid_on is null or
 nullif(btrim(coalesce(p_method,'')),'') is null or
 nullif(btrim(coalesce(p_reference,'')),'') is null then raise exception 'Enter valid amount, date, method and payment reference';end if;
 select * into v_c from public.amanah_lump_contracts where id=p_contract_id for update;
 if not found or v_c.status='DRAFT' then raise exception 'Contract must be activated';end if;
 if p_kind='ADVANCE' then
  if v_c.status<>'ACTIVE' or p_billing_id is not null then raise exception 'Advances require active contract, no billing';end if;
  select coalesce(sum(amount),0) into v_paid from public.amanah_lump_payments where contract_id=p_contract_id and payment_kind='ADVANCE';
  v_allowed:=v_c.advance_limit-v_paid;
 elsif p_kind='BILLING' then
  select * into v_b from public.amanah_lump_billings where id=p_billing_id and contract_id=p_contract_id and status='APPROVED';
  if not found then raise exception 'Payment must refer to an approved billing in this contract';end if;
  select coalesce(sum(amount),0) into v_paid from public.amanah_lump_payments where billing_id=p_billing_id and payment_kind='BILLING';
  v_allowed:=v_b.payable_amount-v_paid;
 elsif p_kind='RETENTION' then
  if v_c.status<>'CLOSED' or p_billing_id is not null then raise exception 'Retention can be released only after GM closes the contract';end if;
  select coalesce(sum(retention_amount),0) into v_allowed from public.amanah_lump_billings where contract_id=p_contract_id and status='APPROVED';
  select coalesce(sum(amount),0) into v_paid from public.amanah_lump_payments where contract_id=p_contract_id and payment_kind='RETENTION';
  v_allowed:=v_allowed-v_paid;
 else
  raise exception 'Unsupported payment type';
 end if;
 if round(p_amount,2)>v_allowed+0.001 then raise exception 'Payment exceeds available balance %',greatest(v_allowed,0);end if;
 insert into public.amanah_lump_payments(contract_id,billing_id,payment_kind,amount,paid_on,payment_method,payment_reference,recipient_ack)
 values(p_contract_id,p_billing_id,p_kind,round(p_amount,2),p_paid_on,btrim(p_method),btrim(p_reference),nullif(btrim(p_ack),''))
 returning id into v_id;
 return v_id;
end $fn$;

-- Exactly one Project Cost entry is posted on GM-approved earned work.
-- Advances, retention releases and cash billing payments never post a second expense.
create unique index if not exists uq_project_cost_lump_sum_billing
 on public.project_cost_entries(reference_id) where reference_id like 'LUMP-SUM:%';

create or replace function public.amanah_lump_post_approved_cost()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare v_project text;v_kind text;v_title text;v_party text;
begin
 if new.status='APPROVED' and old.status is distinct from 'APPROVED' then
  select project_id,contract_type,scope_title,contractor_name
  into v_project,v_kind,v_title,v_party from public.amanah_lump_contracts where id=new.contract_id;
  insert into public.project_cost_entries(project_id,cost_date,cost_type,description,
     quantity,unit,unit_cost,amount,reference_id,notes)
  values (v_project,current_date,
     case when v_kind='DIRECT_LABOR' then 'LABOR' else 'OTHER' end,
     'LUMP SUM '||v_kind||' - '||v_title||' / '||v_party||' - '||new.milestone,
     1,'BILLING',new.gross_amount,new.gross_amount,
     'LUMP-SUM:'||new.id::text,
     'GM-approved certified work. Net cash payable may differ due to retention, advances, or withholding.')
  on conflict (reference_id) where (reference_id like 'LUMP-SUM:%')
  do nothing;
 end if;
 return new;
end $fn$;
drop trigger if exists trg_lump_post_approved_cost on public.amanah_lump_billings;
create trigger trg_lump_post_approved_cost after update of status on public.amanah_lump_billings
 for each row execute function public.amanah_lump_post_approved_cost();

-- Prevent direct modification/deletion of automatically posted certified costs.
create or replace function public.guard_lump_sum_project_cost()
returns trigger language plpgsql set search_path=public as $fn$
begin
 if pg_trigger_depth()<=1 and (
   (tg_op<>'INSERT' and coalesce(old.reference_id like 'LUMP-SUM:%',false))
   or (tg_op<>'DELETE' and coalesce(new.reference_id like 'LUMP-SUM:%',false))
 ) then
  raise exception 'This approved Lump-Sum Contract cost is managed by certified billing and cannot be changed directly';
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $fn$;
drop trigger if exists trg_guard_lump_sum_project_cost on public.project_cost_entries;
create trigger trg_guard_lump_sum_project_cost before insert or update or delete on public.project_cost_entries
 for each row execute function public.guard_lump_sum_project_cost();

-- Grant only controlled operations to authenticated callers; no direct table writes.
do $fn$
declare r record;
begin
 for r in select oid::regprocedure::text as signature
  from pg_proc where pronamespace='public'::regnamespace
    and proname like 'amanah_lump_%'
    and proname not in ('amanah_lump_post_approved_cost')
 loop
  execute 'revoke all on function '||r.signature||' from public,anon';
  execute 'grant execute on function '||r.signature||' to authenticated';
 end loop;
end $fn$;
