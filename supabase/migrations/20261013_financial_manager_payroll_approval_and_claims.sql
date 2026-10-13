
-- AMANAH Financial Manager Payroll Approval and Paycheck Release.
-- New payroll saves as DRAFT, submits for finance approval only when all pay lines are persisted.
-- Project Group Labor costs appear only after finance approval; claim receipts are auditable.
begin;

insert into public.amanah_permissions(permission_key,module,action,description)
values ('payroll.approve','Payroll','approve','Review and approve payroll for paycheck release')
on conflict(permission_key) do nothing;

insert into public.amanah_roles(role_name,description,is_system)
values ('FINANCIAL MANAGER','Approves payroll and authorizes employee paycheck release',true)
on conflict(role_name) do nothing;

insert into public.amanah_role_permissions(role_id,permission_id)
select r.role_id,p.permission_id from public.amanah_roles r
join public.amanah_permissions p on p.permission_key in ('payroll.approve','payroll.view','approvals.view')
where r.role_name='FINANCIAL MANAGER'
on conflict do nothing;

insert into public.amanah_role_permissions(role_id,permission_id)
select r.role_id,p.permission_id from public.amanah_roles r
join public.amanah_permissions p on p.permission_key='payroll.approve'
where r.role_name='SUPER ADMIN'
on conflict do nothing;

alter table public.payroll_runs
  add column if not exists submitted_by uuid,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text;

alter table public.payroll_runs drop constraint if exists payroll_runs_status_check;
alter table public.payroll_runs
 add constraint payroll_runs_status_check
 check(status in ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','VOID','POSTED'));

create table if not exists public.payroll_approval_decisions(
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(payroll_run_id) on delete restrict,
  decision text not null check(decision in ('APPROVED','REJECTED')),
  notes text,
  decided_by uuid not null,
  decided_at timestamptz not null default now()
);
create index if not exists idx_payroll_decisions_run on public.payroll_approval_decisions(payroll_run_id);
alter table public.payroll_approval_decisions enable row level security;

create table if not exists public.payroll_paycheck_claims(
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(payroll_run_id) on delete restrict,
  payroll_item_id uuid references public.payroll_items(payroll_item_id) on delete restrict,
  payroll_group_item_id uuid references public.payroll_group_items(payroll_group_item_id) on delete restrict,
  recipient_name text not null,
  amount numeric(14,2) not null check(amount>0),
  released_on date not null,
  payment_method text not null check(payment_method in ('CASH','CHECK','BANK TRANSFER','OTHER')),
  payment_reference text not null,
  acknowledgment text not null,
  released_by uuid not null,
  created_at timestamptz not null default now(),
  constraint claim_exactly_one_recipient check (
    (payroll_item_id is not null and payroll_group_item_id is null)
    or (payroll_item_id is null and payroll_group_item_id is not null)
  )
);
create unique index if not exists uq_payroll_claim_employee
 on public.payroll_paycheck_claims(payroll_item_id)
 where payroll_item_id is not null;
create unique index if not exists uq_payroll_claim_group
 on public.payroll_paycheck_claims(payroll_group_item_id)
 where payroll_group_item_id is not null;
create unique index if not exists uq_payroll_claim_reference
 on public.payroll_paycheck_claims(payroll_run_id,payment_reference);
create index if not exists idx_payroll_claim_run on public.payroll_paycheck_claims(payroll_run_id);
alter table public.payroll_paycheck_claims enable row level security;

-- Server-side privileges. Finance role is distinct from payroll preparer.
create or replace function public.amanah_payroll_can_approve()
returns boolean language sql stable security definer set search_path=public as $fn$
 select (select auth.uid()) is not null
 and (select public.amanah_has_permission('payroll.approve'));
$fn$;
create or replace function public.amanah_payroll_can_prepare()
returns boolean language sql stable security definer set search_path=public as $fn$
 select (select auth.uid()) is not null
 and (select public.amanah_has_permission('payroll.manage'));
$fn$;
create or replace function public.amanah_payroll_can_release()
returns boolean language sql stable security definer set search_path=public as $fn$
 select (select auth.uid()) is not null
 and ((select public.amanah_has_permission('payroll.manage'))
   or (select public.amanah_has_permission('payroll.approve')));
$fn$;
create or replace function public.amanah_payroll_can_view()
returns boolean language sql stable security definer set search_path=public as $fn$
 select (select auth.uid()) is not null
 and ((select public.amanah_has_permission('payroll.view'))
   or (select public.amanah_has_permission('payroll.approve')));
$fn$;

-- All writes go through the existing restricted Payroll preparer permissions.
drop policy if exists payroll_runs_authenticated_insert on public.payroll_runs;
drop policy if exists payroll_runs_authenticated_update on public.payroll_runs;
drop policy if exists payroll_runs_authenticated_select on public.payroll_runs;
create policy payroll_runs_preparer_insert on public.payroll_runs
 for insert to authenticated with check(
   (select public.amanah_payroll_can_prepare()) and status='DRAFT');
create policy payroll_runs_role_read on public.payroll_runs
 for select to authenticated using ((select public.amanah_payroll_can_view()));

drop policy if exists payroll_items_authenticated_insert on public.payroll_items;
drop policy if exists payroll_items_authenticated_update on public.payroll_items;
drop policy if exists payroll_items_authenticated_select on public.payroll_items;
create policy payroll_items_preparer_insert on public.payroll_items
 for insert to authenticated with check ((select public.amanah_payroll_can_prepare()));
create policy payroll_items_role_read on public.payroll_items
 for select to authenticated using ((select public.amanah_payroll_can_view()));

alter table public.payroll_group_items enable row level security;
drop policy if exists payroll_group_items_preparer_insert on public.payroll_group_items;
drop policy if exists payroll_group_items_role_read on public.payroll_group_items;
create policy payroll_group_items_preparer_insert on public.payroll_group_items
 for insert to authenticated with check ((select public.amanah_payroll_can_prepare()));
create policy payroll_group_items_role_read on public.payroll_group_items
 for select to authenticated using ((select public.amanah_payroll_can_view()));

create policy payroll_decisions_role_read on public.payroll_approval_decisions
 for select to authenticated using ((select public.amanah_payroll_can_view()));
create policy payroll_claims_role_read on public.payroll_paycheck_claims
 for select to authenticated using ((select public.amanah_payroll_can_view()));

-- Remove authenticated direct mutations. SECURITY DEFINER RPCs are the only way
-- to submit, decide, or mark a paycheck released.
revoke update,delete on public.payroll_runs,public.payroll_items,public.payroll_group_items
 from authenticated,anon;
revoke insert,update,delete on public.payroll_approval_decisions,public.payroll_paycheck_claims
 from public,authenticated,anon;
grant select on public.payroll_runs,public.payroll_items,public.payroll_group_items,
 public.payroll_approval_decisions,public.payroll_paycheck_claims to authenticated;
grant insert on public.payroll_runs,public.payroll_items,public.payroll_group_items to authenticated;

create or replace function public.amanah_payroll_guard_run_insert()
returns trigger language plpgsql set search_path=public as $fn$
begin
 if new.status<>'DRAFT' or auth.uid() is null
    or not (select public.amanah_payroll_can_prepare()) then
    raise exception 'Only Payroll preparers can create Draft runs';
 end if;
 if new.period_end < new.period_start then raise exception 'Payroll dates are invalid';end if;
 new.created_by:=auth.uid();
 return new;
end $fn$;
drop trigger if exists trg_payroll_guard_insert on public.payroll_runs;
create trigger trg_payroll_guard_insert
 before insert on public.payroll_runs
 for each row execute function public.amanah_payroll_guard_run_insert();

create or replace function public.amanah_payroll_guard_item()
returns trigger language plpgsql set search_path=public as $fn$
declare v_status text;v_run uuid;
begin
 if tg_op='DELETE' then
    v_run:=old.payroll_run_id;
 else
    v_run:=new.payroll_run_id;
 end if;
 select status into v_status from public.payroll_runs
 where payroll_run_id=v_run for update;
 if v_status is null then raise exception 'Payroll run not found';end if;
 if v_status<>'DRAFT' or not (select public.amanah_payroll_can_prepare()) then
    raise exception 'Payroll lines can be edited only by Payroll staff while the run is Draft';
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='UPDATE' and new.payroll_run_id is distinct from old.payroll_run_id then
    raise exception 'Cannot move payroll line to another run';
 end if;
 return new;
end $fn$;
drop trigger if exists trg_guard_employee_payroll_item on public.payroll_items;
create trigger trg_guard_employee_payroll_item
 before insert or update or delete on public.payroll_items
 for each row execute function public.amanah_payroll_guard_item();
drop trigger if exists trg_guard_group_payroll_item on public.payroll_group_items;
create trigger trg_guard_group_payroll_item
 before insert or update or delete on public.payroll_group_items
 for each row execute function public.amanah_payroll_guard_item();

create or replace function public.amanah_payroll_submit(p_run_id uuid)
returns void language plpgsql security definer set search_path=public as $fn$
declare v_run public.payroll_runs%rowtype;v_sum numeric;v_employee_count int;v_lines int;
begin
 if not (select public.amanah_payroll_can_prepare()) then
   raise exception 'Payroll preparer permission required';
 end if;
 select * into v_run from public.payroll_runs where payroll_run_id=p_run_id for update;
 if not found then raise exception 'Payroll not found';end if;
 if v_run.status<>'DRAFT' then raise exception 'Only complete Draft payroll can be submitted';end if;
 select count(*),coalesce(sum(gross_pay),0) into v_employee_count,v_sum
 from public.payroll_items where payroll_run_id=p_run_id;
 select count(*),v_sum+coalesce(sum(gross_pay),0) into v_lines,v_sum
 from public.payroll_group_items where payroll_run_id=p_run_id;
 if v_employee_count+v_lines=0 or v_sum<=0 then raise exception 'No payable payroll lines recorded';end if;
 if v_employee_count<>v_run.employee_count or abs(v_sum-v_run.total_gross)>0.011 then
   raise exception 'Saved payroll lines do not match recorded total. Review and retry.';
 end if;
 update public.payroll_runs
 set status='PENDING_APPROVAL',submitted_by=auth.uid(),submitted_at=now(),
     reviewed_at=null,approved_by=null,approved_at=null,review_notes=null
 where payroll_run_id=p_run_id;
end $fn$;

create or replace function public.amanah_payroll_decide(
 p_run_id uuid,p_approve boolean,p_notes text default null
)
returns void language plpgsql security definer set search_path=public as $fn$
declare v_run public.payroll_runs%rowtype;v_total numeric;v_lines int;
begin
 if not (select public.amanah_payroll_can_approve()) then
   raise exception 'Only the Financial Manager can approve or reject payroll';
 end if;
 if p_approve is null then raise exception 'Decision is required';end if;
 select * into v_run from public.payroll_runs where payroll_run_id=p_run_id for update;
 if not found or v_run.status<>'PENDING_APPROVAL' then
    raise exception 'Payroll is not awaiting Financial Manager approval';
 end if;
 if p_approve then
   select coalesce(sum(amount),0), count(*) into v_total,v_lines from (
     select gross_pay as amount from public.payroll_items where payroll_run_id=p_run_id
     union all select gross_pay from public.payroll_group_items where payroll_run_id=p_run_id
   ) x;
   if v_lines=0 or abs(v_total-v_run.total_gross)>0.011 then
      raise exception 'Payroll total changed since submission; cannot approve';
   end if;
 elsif nullif(btrim(coalesce(p_notes,'')),'') is null then
   raise exception 'A rejection reason is required';
 end if;
 update public.payroll_runs
 set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
     approved_by=case when p_approve then auth.uid() else null end,
     approved_at=case when p_approve then now() else null end,
     reviewed_at=now(),
     review_notes=nullif(btrim(coalesce(p_notes,'')),'')
 where payroll_run_id=p_run_id;
 insert into public.payroll_approval_decisions(payroll_run_id,decision,notes,decided_by)
 values(p_run_id,case when p_approve then 'APPROVED' else 'REJECTED' end,
        nullif(btrim(coalesce(p_notes,'')),''),auth.uid());
end $fn$;

create or replace function public.amanah_payroll_record_claim(
 p_run_id uuid,p_item_type text,p_item_id uuid,p_recipient text,
 p_payment_method text,p_reference text,p_ack text,p_paid_on date
)
returns uuid language plpgsql security definer set search_path=public as $fn$
declare v_status text;v_employee_item uuid;v_group_item uuid;v_name text;v_gross numeric;v_id uuid;
begin
 if not (select public.amanah_payroll_can_release()) then
   raise exception 'Authorized Payroll or Financial Manager permission required to release paychecks';
 end if;
 select status into v_status from public.payroll_runs where payroll_run_id=p_run_id for update;
 if v_status<>'APPROVED' then raise exception 'Paychecks are locked until Financial Manager approval';end if;
 if nullif(btrim(coalesce(p_reference,'')),'') is null
   or nullif(btrim(coalesce(p_ack,'')),'') is null
   or nullif(btrim(coalesce(p_recipient,'')),'') is null
   or p_paid_on is null
   or p_payment_method not in ('CASH','CHECK','BANK TRANSFER','OTHER') then
   raise exception 'Recipient, payment method/date/reference and acknowledgment are required';
 end if;
 if p_item_type='EMPLOYEE' then
   select payroll_item_id,employee_name,gross_pay into v_employee_item,v_name,v_gross
   from public.payroll_items where payroll_item_id=p_item_id and payroll_run_id=p_run_id;
   if not found then raise exception 'Employee paycheck does not belong to this payroll run';end if;
 elsif p_item_type='GROUP' then
   select payroll_group_item_id,group_name,gross_pay into v_group_item,v_name,v_gross
   from public.payroll_group_items where payroll_group_item_id=p_item_id and payroll_run_id=p_run_id;
   if not found then raise exception 'Group Labor payment does not belong to this payroll run';end if;
 else raise exception 'Invalid paycheck item type';end if;
 if v_gross<=0 then raise exception 'Paycheck has no payable amount';end if;

 insert into public.payroll_paycheck_claims(
   payroll_run_id,payroll_item_id,payroll_group_item_id,recipient_name,amount,
   released_on,payment_method,payment_reference,acknowledgment,released_by
 ) values(
   p_run_id,v_employee_item,v_group_item,btrim(p_recipient),round(v_gross,2),
   p_paid_on,p_payment_method,btrim(p_reference),btrim(p_ack),auth.uid()
 ) returning id into v_id;
 return v_id;
end $fn$;

-- Group Labor project costs previously posted on DRAFT. From now on they post
-- only after approved payroll; all other statuses remove the pending entry.
create or replace function public.sync_payroll_group_cost(p_group_item_id uuid)
returns void language plpgsql security definer set search_path=public as $fn$
declare
 r record;
 v_reference text:='GROUP-LABOR:'||p_group_item_id::text;
begin
 select g.payroll_group_item_id,g.project_id,g.group_name,g.activity_description,
   g.meters_accomplished,g.rate_per_meter,g.gross_pay,
   pr.period_start,pr.period_end,pr.status as payroll_status
 into r
 from public.payroll_group_items g
 join public.payroll_runs pr on pr.payroll_run_id=g.payroll_run_id
 where g.payroll_group_item_id=p_group_item_id;

 if not found or r.payroll_status<>'APPROVED' then
   delete from public.project_cost_entries where reference_id=v_reference;
   return;
 end if;

 insert into public.project_cost_entries(
   project_id,cost_date,cost_type,description,quantity,unit,unit_cost,amount,reference_id,notes
 ) values(
   r.project_id,r.period_end,'LABOR',
   'GROUP LABOR: '||r.group_name||
     case when nullif(btrim(coalesce(r.activity_description,'')),'') is not null
       then ' - '||btrim(r.activity_description) else '' end,
   r.meters_accomplished,'METER',r.rate_per_meter,r.gross_pay,
   v_reference,
   'Financial Manager-approved Group Labor Payroll for '||r.period_start||' to '||r.period_end
 )
 on conflict (reference_id) where (reference_id like 'GROUP-LABOR:%')
 do update set project_id=excluded.project_id,cost_date=excluded.cost_date,
   cost_type='LABOR',description=excluded.description,
   quantity=excluded.quantity,unit='METER',unit_cost=excluded.unit_cost,
   amount=excluded.amount,notes=excluded.notes;
end $fn$;

-- Reconcile historical rows using updated posting rule; existing draft cost
-- entries (if any) are taken out of the financial tally.
do $fn$
declare g record;
begin
 for g in select payroll_group_item_id from public.payroll_group_items loop
   perform public.sync_payroll_group_cost(g.payroll_group_item_id);
 end loop;
end $fn$;

revoke all on function public.amanah_payroll_can_approve() from public,anon;
revoke all on function public.amanah_payroll_can_prepare() from public,anon;
revoke all on function public.amanah_payroll_can_release() from public,anon;
revoke all on function public.amanah_payroll_can_view() from public,anon;
revoke all on function public.amanah_payroll_submit(uuid) from public,anon;
revoke all on function public.amanah_payroll_decide(uuid,boolean,text) from public,anon;
revoke all on function public.amanah_payroll_record_claim(uuid,text,uuid,text,text,text,text,date) from public,anon;
grant execute on function public.amanah_payroll_can_approve() to authenticated;
grant execute on function public.amanah_payroll_can_prepare() to authenticated;
grant execute on function public.amanah_payroll_can_release() to authenticated;
grant execute on function public.amanah_payroll_can_view() to authenticated;
grant execute on function public.amanah_payroll_submit(uuid) to authenticated;
grant execute on function public.amanah_payroll_decide(uuid,boolean,text) to authenticated;
grant execute on function public.amanah_payroll_record_claim(uuid,text,uuid,text,text,text,text,date) to authenticated;

commit;