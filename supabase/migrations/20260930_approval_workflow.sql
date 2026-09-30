-- AMANAH General Manager Approval Workflow
-- Engineers and operational staff submit requests.
-- General Manager / Administrator approves or rejects through Approval Center.

alter table public.project_activities
  add column if not exists approval_status text not null default 'NOT REQUIRED',
  add column if not exists approval_requested_by uuid,
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_decided_by uuid,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_remarks text;

alter table public.equipment_maintenance
  add column if not exists approval_status text not null default 'NOT REQUIRED',
  add column if not exists approval_requested_by uuid,
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approval_decided_by uuid,
  add column if not exists approval_decided_at timestamptz,
  add column if not exists approval_remarks text;

insert into public.amanah_permissions(permission_key,module,action,description) values
('approvals.view','Approval Center','VIEW','View approval requests assigned to the General Manager'),
('schedule.approve','Activity Calendar','APPROVE','Approve or reject activity schedules submitted by engineers'),
('purchasing.approve','Purchasing','APPROVE','Approve or reject purchase requests'),
('maintenance.approve','Maintenance','APPROVE','Approve or reject maintenance requests')
on conflict(permission_key) do update set
  module=excluded.module,
  action=excluded.action,
  description=excluded.description;

do $$
declare
  r_admin uuid;
begin
  select role_id into r_admin
  from public.amanah_roles
  where upper(role_name)='ADMINISTRATOR'
  limit 1;

  if r_admin is not null then
    insert into public.amanah_role_permissions(role_id,permission_id)
    select r_admin,p.permission_id
    from public.amanah_permissions p
    where p.permission_key in ('approvals.view','schedule.approve','purchasing.approve','maintenance.approve')
    on conflict do nothing;
  end if;
end $$;

create table if not exists public.amanah_approval_requests (
  approval_id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('ACTIVITY','PURCHASE_REQUEST','MAINTENANCE')),
  entity_id uuid not null,
  title text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  requested_by uuid not null,
  requested_by_name text,
  requester_email text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  submitted_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  decision_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists amanah_one_pending_approval_per_entity
on public.amanah_approval_requests(request_type,entity_id)
where status='PENDING';

create index if not exists amanah_approval_status_idx
on public.amanah_approval_requests(status,submitted_at desc);

create index if not exists amanah_approval_type_idx
on public.amanah_approval_requests(request_type,submitted_at desc);

alter table public.amanah_approval_requests enable row level security;

drop policy if exists amanah_approvals_select on public.amanah_approval_requests;
create policy amanah_approvals_select on public.amanah_approval_requests
for select to authenticated
using (
  requested_by=auth.uid()
  or public.amanah_has_permission('approvals.view')
);

drop policy if exists amanah_approvals_insert on public.amanah_approval_requests;
create policy amanah_approvals_insert on public.amanah_approval_requests
for insert to authenticated
with check (
  requested_by=auth.uid()
);

drop policy if exists amanah_approvals_update on public.amanah_approval_requests;
create policy amanah_approvals_update on public.amanah_approval_requests
for update to authenticated
using (
  public.amanah_has_permission('approvals.view')
)
with check (
  public.amanah_has_permission('approvals.view')
);

create or replace function public.amanah_submit_approval(
  p_request_type text,
  p_entity_id uuid,
  p_title text,
  p_description text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_permission text;
  v_existing uuid;
  v_id uuid;
  v_email text := coalesce(auth.jwt()->>'email','');
  v_name text := coalesce(
    auth.jwt()->'user_metadata'->>'full_name',
    auth.jwt()->'user_metadata'->>'name',
    split_part(v_email,'@',1)
  );
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  v_permission := case upper(p_request_type)
    when 'ACTIVITY' then 'schedule.manage'
    when 'PURCHASE_REQUEST' then 'purchasing.manage'
    when 'MAINTENANCE' then 'maintenance.manage'
    else null
  end;

  if v_permission is null then
    raise exception 'Unsupported approval request type.';
  end if;

  if not public.amanah_has_permission(v_permission) then
    raise exception 'You are not authorized to submit this request.';
  end if;

  select approval_id into v_existing
  from public.amanah_approval_requests
  where request_type=upper(p_request_type)
    and entity_id=p_entity_id
    and status='PENDING'
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.amanah_approval_requests(
    request_type,entity_id,title,description,payload,
    requested_by,requested_by_name,requester_email,status
  )
  values(
    upper(p_request_type),p_entity_id,p_title,p_description,coalesce(p_payload,'{}'::jsonb),
    auth.uid(),v_name,v_email,'PENDING'
  )
  returning approval_id into v_id;

  if upper(p_request_type)='ACTIVITY' then
    update public.project_activities
    set approval_status='PENDING',
        approval_requested_by=auth.uid(),
        approval_requested_at=now(),
        approval_decided_by=null,
        approval_decided_at=null,
        approval_remarks=null,
        activity_status='PENDING APPROVAL',
        updated_at=now()
    where activity_id=p_entity_id;
  elsif upper(p_request_type)='PURCHASE_REQUEST' then
    update public.purchase_requests
    set status='PENDING APPROVAL',
        reviewed_at=null,
        reviewed_by=null,
        review_remarks=null,
        updated_at=now()
    where purchase_request_id=p_entity_id;
  elsif upper(p_request_type)='MAINTENANCE' then
    update public.equipment_maintenance
    set approval_status='PENDING',
        approval_requested_by=auth.uid(),
        approval_requested_at=now(),
        approval_decided_by=null,
        approval_decided_at=null,
        approval_remarks=null,
        updated_at=now()
    where maintenance_id=p_entity_id;
  end if;

  return v_id;
end $$;

create or replace function public.amanah_decide_approval(
  p_approval_id uuid,
  p_decision text,
  p_remarks text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_type text;
  v_entity uuid;
  v_permission text;
  v_email text := coalesce(auth.jwt()->>'email','');
  v_name text := coalesce(
    auth.jwt()->'user_metadata'->>'full_name',
    auth.jwt()->'user_metadata'->>'name',
    split_part(v_email,'@',1)
  );
  v_status text := upper(p_decision);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if v_status not in ('APPROVED','REJECTED') then
    raise exception 'Decision must be APPROVED or REJECTED.';
  end if;

  select request_type,entity_id into v_type,v_entity
  from public.amanah_approval_requests
  where approval_id=p_approval_id and status='PENDING';

  if v_type is null then
    raise exception 'Pending approval request not found.';
  end if;

  v_permission := case v_type
    when 'ACTIVITY' then 'schedule.approve'
    when 'PURCHASE_REQUEST' then 'purchasing.approve'
    when 'MAINTENANCE' then 'maintenance.approve'
    else null
  end;

  if v_permission is null or not public.amanah_has_permission(v_permission) then
    raise exception 'You are not authorized to approve this request.';
  end if;

  update public.amanah_approval_requests
  set status=v_status,
      decided_by=auth.uid(),
      decided_by_name=v_name,
      decided_at=now(),
      decision_remarks=p_remarks,
      updated_at=now()
  where approval_id=p_approval_id;

  if v_type='ACTIVITY' then
    update public.project_activities
    set approval_status=case when v_status='APPROVED' then 'APPROVED' else 'REJECTED' end,
        approval_decided_by=auth.uid(),
        approval_decided_at=now(),
        approval_remarks=p_remarks,
        activity_status=case when v_status='APPROVED' then 'PLANNED' else 'REJECTED' end,
        updated_at=now()
    where activity_id=v_entity;
  elsif v_type='PURCHASE_REQUEST' then
    update public.purchase_requests
    set status=v_status,
        reviewed_by=v_email,
        reviewed_at=now(),
        review_remarks=p_remarks,
        updated_at=now()
    where purchase_request_id=v_entity;
  elsif v_type='MAINTENANCE' then
    update public.equipment_maintenance
    set approval_status=case when v_status='APPROVED' then 'APPROVED' else 'REJECTED' end,
        approval_decided_by=auth.uid(),
        approval_decided_at=now(),
        approval_remarks=p_remarks,
        updated_at=now()
    where maintenance_id=v_entity;
  end if;
end $$;

create or replace function public.amanah_decide_pending_approval(
  p_request_type text,
  p_entity_id uuid,
  p_decision text,
  p_remarks text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
begin
  select approval_id into v_id
  from public.amanah_approval_requests
  where request_type=upper(p_request_type)
    and entity_id=p_entity_id
    and status='PENDING'
  order by submitted_at desc
  limit 1;

  if v_id is null then
    raise exception 'No pending approval was found for this request.';
  end if;

  perform public.amanah_decide_approval(v_id,p_decision,p_remarks);
  return v_id;
end $$;

grant execute on function public.amanah_submit_approval(text,uuid,text,text,jsonb) to authenticated;
grant execute on function public.amanah_decide_approval(uuid,text,text) to authenticated;
grant execute on function public.amanah_decide_pending_approval(text,uuid,text,text) to authenticated;