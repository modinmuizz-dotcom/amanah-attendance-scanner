begin;

create or replace function public.amanah_get_driver_material_pickups(
  p_employee_id text,
  p_attendance_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_att public.attendance%rowtype;
  v_result jsonb;
begin
  select * into v_att
  from public.attendance
  where attendance_id=p_attendance_id
    and employee_id=p_employee_id
    and status='IN'
  limit 1;

  if not found then
    raise exception 'Active attendance was not found for this driver/operator.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'activity_id',a.activity_id,
      'activity_date',a.activity_date,
      'activity',a.activity,
      'description',a.description,
      'project_id',a.project_id,
      'project_name',a.project_name,
      'scheduled_start',a.scheduled_start,
      'scheduled_end',a.scheduled_end,
      'activity_status',a.activity_status,
      'approval_status',a.approval_status,
      'material_pickup_request_id',a.material_pickup_request_id,
      'purchase_order_no',po.po_no,
      'supplier_name',mpr.supplier_name,
      'pickup_location',mpr.pickup_location,
      'delivery_location',coalesce(mpr.project_location,po.project_location,po.project_name),
      'equipment_id',v_att.equipment_id,
      'equipment_name',v_att.equipment_name,
      'materials',coalesce((
        select jsonb_agg(jsonb_build_object(
          'purchase_order_item_id',mpri.purchase_order_item_id,
          'material_name',mpri.material_name,
          'specifications',mpri.specifications,
          'quantity',mpri.quantity,
          'unit',mpri.unit
        ) order by mpri.created_at)
        from public.material_pickup_request_items mpri
        where mpri.pickup_request_id=mpr.pickup_request_id
      ),'[]'::jsonb)
    ) order by a.activity_date,a.scheduled_start
  ),'[]'::jsonb)
  into v_result
  from public.project_activities a
  join public.project_activity_equipment pae
    on pae.activity_id=a.activity_id
   and pae.equipment_id=v_att.equipment_id
  join public.material_pickup_requests mpr
    on mpr.pickup_request_id=a.material_pickup_request_id
  left join public.purchase_orders po
    on po.purchase_order_id=mpr.purchase_order_id
  where a.material_pickup_request_id is not null
    and upper(a.activity)='MATERIAL PICKUP'
    and a.approval_status='APPROVED'
    and a.activity_status in ('PLANNED','IN PROGRESS')
    and mpr.status='APPROVED';

  return v_result;
end
$function$;

create or replace function public.amanah_complete_driver_material_pickup(
  p_employee_id text,
  p_attendance_id text,
  p_activity_id uuid,
  p_photo_path text,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_att public.attendance%rowtype;
  v_activity public.project_activities%rowtype;
  v_pickup public.material_pickup_requests%rowtype;
  v_summary jsonb;
begin
  if nullif(trim(coalesce(p_photo_path,'')),'') is null then
    raise exception 'Receiving evidence photo is required before marking materials received.';
  end if;

  select * into v_att
  from public.attendance
  where attendance_id=p_attendance_id
    and employee_id=p_employee_id
    and status='IN'
  limit 1;

  if not found then
    raise exception 'Active attendance was not found for this driver/operator.';
  end if;

  select * into v_activity
  from public.project_activities a
  where a.activity_id=p_activity_id
    and a.material_pickup_request_id is not null
    and upper(a.activity)='MATERIAL PICKUP'
    and a.approval_status='APPROVED'
    and a.activity_status in ('PLANNED','IN PROGRESS')
    and exists(
      select 1
      from public.project_activity_equipment pae
      where pae.activity_id=a.activity_id
        and pae.equipment_id=v_att.equipment_id
    )
  for update;

  if not found then
    raise exception 'This material pickup activity is not assigned to the current attendance equipment.';
  end if;

  select * into v_pickup
  from public.material_pickup_requests
  where pickup_request_id=v_activity.material_pickup_request_id
    and status='APPROVED'
  for update;

  if not found then
    raise exception 'The Material Pickup Request is no longer approved for receiving.';
  end if;

  insert into public.activity_evidence_photos(
    attendance_id,project_activity_id,employee_id,photo_path
  )
  values(
    p_attendance_id,p_activity_id,p_employee_id,p_photo_path
  );

  update public.project_activities
  set activity_status='DONE',
      completed_at=now(),
      completion_remarks=coalesce(nullif(trim(p_remarks),''),'Material pickup completed and materials delivered to site by driver/operator.'),
      updated_at=now()
  where activity_id=p_activity_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'purchase_order_item_id',mpri.purchase_order_item_id,
    'material_name',mpri.material_name,
    'quantity',mpri.quantity,
    'unit',mpri.unit
  ) order by mpri.created_at),'[]'::jsonb)
  into v_summary
  from public.material_pickup_request_items mpri
  where mpri.pickup_request_id=v_pickup.pickup_request_id;

  return jsonb_build_object(
    'success',true,
    'activity_id',p_activity_id,
    'pickup_request_id',v_pickup.pickup_request_id,
    'pickup_request_no',v_pickup.pickup_request_no,
    'purchase_order_id',v_pickup.purchase_order_id,
    'materials',v_summary
  );
end
$function$;

commit;