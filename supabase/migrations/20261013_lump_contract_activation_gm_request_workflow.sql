-- AMANAH Lump-Sum Contract Activation: explicit Submit -> GM Approve/Reject.
-- Draft contracts are not pending approval until a user submits them.
-- Decisions remain auditable, including re-submissions after rejection.
begin;

alter table public.amanah_lump_contracts
  drop constraint if exists amanah_lump_contracts_status_check;
alter table public.amanah_lump_contracts
  add constraint amanah_lump_contracts_status_check
  check (status in ('DRAFT','PENDING_APPROVAL','REJECTED','ACTIVE','CLOSED'));

create table if not exists public.amanah_lump_activation_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.amanah_lump_contracts(id) on delete restrict,
  submitted_by uuid not null default auth.uid(),
  submitted_at timestamptz not null default now(),
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED')),
  decided_by uuid,
  decided_at timestamptz,
  decision_notes text,
  constraint activation_decision_consistency check (
    (status='PENDING' and decided_by is null and decided_at is null)
    or (status<>'PENDING' and decided_by is not null and decided_at is not null)
  )
);
create unique index if not exists uq_lump_pending_activation
  on public.amanah_lump_activation_requests(contract_id)
  where status='PENDING';
create index if not exists idx_lump_activation_requests_submitted
  on public.amanah_lump_activation_requests(submitted_at desc);

alter table public.amanah_lump_activation_requests enable row level security;
drop policy if exists lump_activation_requests_read
  on public.amanah_lump_activation_requests;
create policy lump_activation_requests_read
  on public.amanah_lump_activation_requests
  for select to authenticated
  using ((select public.amanah_lump_can_view()));

grant select on public.amanah_lump_activation_requests to authenticated;
revoke insert, update, delete on public.amanah_lump_activation_requests
  from public, anon, authenticated;

create or replace function public.amanah_lump_submit_activation(p_contract_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_contract public.amanah_lump_contracts%rowtype;
  v_request_id uuid;
begin
  if not public.amanah_lump_can('CREATE') then
    raise exception 'Only authorized payroll/contract users can submit contracts for GM approval';
  end if;

  select * into v_contract
  from public.amanah_lump_contracts
  where id = p_contract_id
  for update;

  if not found then raise exception 'Contract not found'; end if;

  if v_contract.status not in ('DRAFT','REJECTED') then
    raise exception 'Only Draft or Rejected contracts may be submitted. Current status: %',
      v_contract.status;
  end if;

  if not exists (
    select 1 from public.projects where project_id = v_contract.project_id
  ) then raise exception 'The contract project no longer exists'; end if;

  if exists (
    select 1 from public.amanah_lump_activation_requests
    where contract_id = p_contract_id and status = 'PENDING'
  ) then raise exception 'This contract already has a pending GM approval request'; end if;

  insert into public.amanah_lump_activation_requests (
    contract_id, submitted_by, status
  ) values (p_contract_id, auth.uid(), 'PENDING')
  returning id into v_request_id;

  update public.amanah_lump_contracts
  set status = 'PENDING_APPROVAL'
  where id = p_contract_id;

  return v_request_id;
end
$function$;

create or replace function public.amanah_lump_decide_activation(
  p_contract_id uuid,
  p_approve boolean,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_contract public.amanah_lump_contracts%rowtype;
  v_request public.amanah_lump_activation_requests%rowtype;
begin
  if not public.amanah_lump_can('ACTIVATE') then
    raise exception 'Only the General Manager or authorized Super Admin may decide contract activation';
  end if;
  if p_approve is null then raise exception 'An approval or rejection decision is required'; end if;

  select * into v_contract
  from public.amanah_lump_contracts where id=p_contract_id for update;
  if not found then raise exception 'Contract not found'; end if;
  if v_contract.status <> 'PENDING_APPROVAL' then
    raise exception 'This contract has not been submitted for GM approval';
  end if;

  select * into v_request
  from public.amanah_lump_activation_requests
  where contract_id=p_contract_id and status='PENDING'
  for update;
  if not found then raise exception 'No pending contract activation request found'; end if;

  if not p_approve and nullif(btrim(coalesce(p_notes,'')),'') is null then
    raise exception 'A rejection reason is required'; end if;

  update public.amanah_lump_activation_requests
  set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
      decided_by=auth.uid(),
      decided_at=now(),
      decision_notes=nullif(btrim(coalesce(p_notes,'')),'')
  where id=v_request.id;

  update public.amanah_lump_contracts
  set status=case when p_approve then 'ACTIVE' else 'REJECTED' end,
      activated_by=case when p_approve then auth.uid() else null end,
      activated_at=case when p_approve then now() else null end
  where id=p_contract_id;
end
$function$;

-- Disable the older direct Draft -> Active pathway, including legacy cached JS.
create or replace function public.amanah_lump_activate(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  raise exception 'Direct contract activation is disabled. Submit the contract and have the GM approve its pending request in Approval Center.';
end
$function$;

revoke all on function public.amanah_lump_submit_activation(uuid)
  from public, anon;
revoke all on function public.amanah_lump_decide_activation(uuid,boolean,text)
  from public, anon;
revoke all on function public.amanah_lump_activate(uuid)
  from public, anon, authenticated;
grant execute on function public.amanah_lump_submit_activation(uuid) to authenticated;
grant execute on function public.amanah_lump_decide_activation(uuid,boolean,text) to authenticated;

comment on function public.amanah_lump_submit_activation(uuid)
  is 'Explicit activation request: DRAFT/REJECTED -> PENDING_APPROVAL, audited by request.';
comment on function public.amanah_lump_decide_activation(uuid,boolean,text)
  is 'GM-only decision: PENDING_APPROVAL -> ACTIVE or REJECTED, with audit and remarks.';
commit;