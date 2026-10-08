-- AMANAH: route material/spare-part needs from a GM-approved Repair Request to Purchasing.
-- The Repair Request itself has already passed GM approval, so this creates an
-- APPROVED Purchase Request directly in Purchasing without creating a second GM approval task.

alter table public.repair_requests
  add column if not exists materials_purchase_request_id uuid
    references public.purchase_requests(purchase_request_id)
    on delete set null;

create index if not exists idx_repair_requests_materials_pr
  on public.repair_requests(materials_purchase_request_id);

create or replace function public.amanah_request_repair_materials(
  p_repair_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repair public.repair_requests%rowtype;
  v_project public.projects%rowtype;
  v_pr public.purchase_requests%rowtype;
  v_email text := coalesce(auth.jwt()->>'email','');
  v_material_count integer;
  v_line integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.amanah_has_permission('maintenance.manage') then
    raise exception 'You are not authorized to request Repair materials.';
  end if;

  select *
  into v_repair
  from public.repair_requests
  where repair_request_id = p_repair_request_id
  for update;

  if not found then
    raise exception 'Repair Request not found.';
  end if;

  if upper(coalesce(v_repair.status,'')) <> 'APPROVED' then
    raise exception 'Repair materials can only be requested after the Repair Request is approved by the General Manager.';
  end if;

  if v_repair.materials_purchase_request_id is not null then
    select *
    into v_pr
    from public.purchase_requests
    where purchase_request_id = v_repair.materials_purchase_request_id;

    return jsonb_build_object(
      'purchase_request_id', v_repair.materials_purchase_request_id,
      'request_no', v_pr.request_no,
      'already_requested', true
    );
  end if;

  if nullif(btrim(coalesce(v_repair.project_id,'')),'') is null then
    raise exception 'A project must be assigned to the Repair Request before requesting materials.';
  end if;

  select *
  into v_project
  from public.projects
  where project_id = v_repair.project_id;

  if not found then
    raise exception 'The project linked to this Repair Request could not be found.';
  end if;

  select count(*)
  into v_material_count
  from public.repair_request_items
  where repair_request_id = p_repair_request_id
    and nullif(btrim(coalesce(material_or_spare_part,'')),'') is not null
    and coalesce(quantity,0) > 0;

  if v_material_count = 0 then
    raise exception 'No material or spare-part line with a quantity was found in this Repair Request.';
  end if;

  insert into public.purchase_requests(
    project_id,
    project_name,
    project_location,
    requester_employee_id,
    requester_name,
    requester_position,
    requester_role,
    request_date,
    needed_by_date,
    priority,
    purpose,
    remarks,
    status,
    purchase_type,
    submitted_at,
    reviewed_at,
    review_remarks,
    created_by,
    updated_at
  )
  values(
    v_repair.project_id,
    coalesce(v_project.project_name, v_repair.project_id),
    v_project.location,
    coalesce(nullif(btrim(v_repair.reported_by),''),'REPAIR-'||v_repair.repair_form_no),
    coalesce(nullif(btrim(v_repair.reported_by),''),'Maintenance Officer'),
    'MAINTENANCE OFFICER',
    'MAINTENANCE OFFICER',
    v_repair.request_date,
    current_date,
    'HIGH',
    'Repair materials / spare parts for approved Repair Request '||v_repair.repair_form_no,
    'Source Repair Request: '||v_repair.repair_form_no||'. GM-approved repair materials routed to Purchasing.',
    'APPROVED',
    'REPAIR MATERIALS',
    now(),
    null,
    'Auto-created from a General Manager-approved Repair Request. No second GM approval is required at this stage.',
    auth.uid(),
    now()
  )
  returning *
  into v_pr;

  insert into public.purchase_request_items(
    purchase_request_id,
    line_no,
    material_name,
    specifications,
    quantity,
    unit,
    estimated_unit_cost,
    estimated_total,
    remarks
  )
  select
    v_pr.purchase_request_id,
    row_number() over(order by display_order, created_at),
    btrim(material_or_spare_part),
    null,
    quantity,
    btrim(unit),
    coalesce(unit_cost,0),
    case when unit_cost is null then null else quantity * unit_cost end,
    work_to_be_done
  from public.repair_request_items
  where repair_request_id = p_repair_request_id
    and nullif(btrim(coalesce(material_or_spare_part,'')),'') is not null
    and coalesce(quantity,0) > 0;

  update public.repair_requests
  set materials_purchase_request_id = v_pr.purchase_request_id,
      updated_at = now()
  where repair_request_id = p_repair_request_id;

  return jsonb_build_object(
    'purchase_request_id', v_pr.purchase_request_id,
    'request_no', v_pr.request_no,
    'already_requested', false,
    'item_count', v_material_count,
    'purchase_type', 'REPAIR MATERIALS'
  );
end;
$$;

revoke all on function public.amanah_request_repair_materials(uuid) from public;
grant execute on function public.amanah_request_repair_materials(uuid) to authenticated;
