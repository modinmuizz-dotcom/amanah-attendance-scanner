begin;

insert into public.amanah_roles(role_name,description,is_system)
select 'GENERAL MANAGER',
       'Final management approval authority for AMANAH workflow requests, including Purchasing, Maintenance and Activity Calendar.',
       true
where not exists (
  select 1 from public.amanah_roles where upper(role_name)='GENERAL MANAGER'
);

insert into public.amanah_role_permissions(role_id,permission_id)
select r.role_id,p.permission_id
from public.amanah_roles r
cross join public.amanah_permissions p
where upper(r.role_name)='GENERAL MANAGER'
  and p.permission_key in (
    'dashboard.view',
    'approvals.view',
    'purchasing.view',
    'purchasing.approve',
    'maintenance.view',
    'maintenance.approve',
    'schedule.view',
    'schedule.approve',
    'reports.view'
  )
  and not exists (
    select 1
    from public.amanah_role_permissions rp
    where rp.role_id=r.role_id
      and rp.permission_id=p.permission_id
  );

create or replace function public.amanah_decide_approval(
  p_approval_id uuid,
  p_decision text,
  p_remarks text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_type text;
  v_entity uuid;
  v_payload jsonb;
  v_action text;
  v_permission text;
  v_email text := coalesce(auth.jwt()->>'email','');
  v_name text := coalesce(
    auth.jwt()->'user_metadata'->>'full_name',
    auth.jwt()->'user_metadata'->>'name',
    split_part(v_email,'@',1)
  );
  v_status text := upper(p_decision);
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if v_status not in ('APPROVED','REJECTED') then
    raise exception 'Decision must be APPROVED or REJECTED.';
  end if;

  select coalesce(
    (
      select upper(r.role_name)
      from public.amanah_user_roles ur
      join public.amanah_roles r on r.role_id=ur.role_id
      where ur.auth_user_id=auth.uid()
      order by case
        when upper(r.role_name)='SUPER ADMIN' then 0
        when upper(r.role_name)='GENERAL MANAGER' then 1
        when upper(r.role_name)='ADMINISTRATOR' then 2
        else 3
      end, r.role_name
      limit 1
    ),
    'UNASSIGNED'
  )
  into v_role;

  if v_role not in ('GENERAL MANAGER','ADMINISTRATOR','SUPER ADMIN') then
    raise exception 'Only the General Manager or an authorized system administrator can approve or reject requests.';
  end if;

  select request_type,entity_id,payload
    into v_type,v_entity,v_payload
  from public.amanah_approval_requests
  where approval_id=p_approval_id and status='PENDING';

  if v_type is null then
    raise exception 'Pending approval request not found.';
  end if;

  v_action := upper(coalesce(v_payload->>'request_action','CREATE'));

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

  if v_action='CANCEL' then
    if v_type='ACTIVITY' then
      update public.project_activities
      set approval_status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,
          approval_decided_by=auth.uid(),
          approval_decided_at=now(),
          approval_remarks=p_remarks,
          activity_status=case when v_status='APPROVED' then 'CANCELLED' else activity_status end,
          updated_at=now()
      where activity_id=v_entity;
    elsif v_type='PURCHASE_REQUEST' then
      update public.purchase_requests
      set status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,
          reviewed_by=v_email,
          reviewed_at=now(),
          review_remarks=p_remarks,
          updated_at=now()
      where purchase_request_id=v_entity;
    elsif v_type='MAINTENANCE' then
      update public.equipment_maintenance
      set approval_status=case when v_status='APPROVED' then 'CANCELLED' else 'APPROVED' end,
          approval_decided_by=auth.uid(),
          approval_decided_at=now(),
          approval_remarks=p_remarks,
          updated_at=now()
      where maintenance_id=v_entity;
    end if;
  elsif v_type='ACTIVITY' then
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
end
$function$;

commit;
