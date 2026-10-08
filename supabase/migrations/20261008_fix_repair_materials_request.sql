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

    if found then
      return jsonb_build_object(
        'purchase_request_id', v_repair.materials_purchase_request_id,
        'request_no', v_pr.request_no,
        'already_requested', true
      );
    end if;

    -- The link exists but the old Purchase Request no longer exists.
    update public.repair_requests
    set materials_purchase_request_id = null,
        updated_at = now()
    where repair_request_id = p_repair_request_id;

    v_repair.materials_purchase_request_id := null;
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

  -- Create first as DRAFT so this uses the same legal status path as normal Purchasing.
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
    reviewed_by,
    review_remarks,
    created_by,
    updated_at
  )
  values(
    v_repair.project_id::text,
    coalesce(nullif(btrim(v_project.project_name),''), v_repair.project_id::text),
    v_project.location,
    coalesce(
      nullif(btrim(v_repair.reported_by),''),
      'REPAIR-'||v_repair.repair_form_no
    ),
    coalesce(
      nullif(btrim(v_repair.reported_by),''),
      'Maintenance Officer'
    ),
    'MAINTENANCE OFFICER',
    'MAINTENANCE OFFICER',
    coalesce(v_repair.request_date,current_date),
    greatest(coalesce(v_repair.request_date,current_date), current_date),
    'HIGH',
    'Repair materials / spare parts for approved Repair Request '||v_repair.repair_form_no,
    'Source Repair Request: '||v_repair.repair_form_no||'. GM-approved repair materials routed to Purchasing.',
    'DRAFT',
    'REPAIR MATERIALS',
    now(),
    null,
    null,
    'Auto-created from a General Manager-approved Repair Request. No second GM approval is required.',
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
    coalesce(nullif(btrim(unit),''),'PCS'),
    coalesce(unit_cost,0),
    case when unit_cost is null then null else quantity * unit_cost end,
    work_to_be_done
  from public.repair_request_items
  where repair_request_id = p_repair_request_id
    and nullif(btrim(coalesce(material_or_spare_part,'')),'') is not null
    and coalesce(quantity,0) > 0;

  update public.purchase_requests
  set status='APPROVED',
      submitted_at=coalesce(submitted_at,now()),
      reviewed_at=now(),
      reviewed_by=coalesce(nullif(v_email,''),'GM-APPROVED REPAIR WORKFLOW'),
      review_remarks='Automatically approved because the source Repair Request was already approved by the General Manager.',
      updated_at=now()
  where purchase_request_id=v_pr.purchase_request_id;

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

exception when others then
  raise exception 'Repair materials request failed: %', SQLERRM;
end;
$$;

revoke all on function public.amanah_request_repair_materials(uuid) from public;
grant execute on function public.amanah_request_repair_materials(uuid) to authenticated;
