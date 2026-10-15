-- Corporate dashboard permission granularity for route-safe navigation.
-- Phase 1-3: one consistent AMANAH dashboard; individual cards disclosed by permission.
-- Summary only; no unrestricted access to underlying finance or personnel rows.
CREATE OR REPLACE FUNCTION public.amanah_dashboard_control_center()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
 can_finance boolean; can_schedule boolean; can_purchasing boolean;
 can_payroll boolean; can_approve boolean; can_equipment boolean;
 can_maintenance boolean; can_attendance boolean;
 v_finance jsonb:=null;v_projects jsonb:=null;v_purchasing jsonb:=null;
 v_payroll jsonb:=null;v_actions jsonb:='[]'::jsonb;
 v_equipment jsonb:=null;v_attendance jsonb:=null;
BEGIN
 IF auth.uid() IS NULL OR NOT public.amanah_has_permission('dashboard.view') THEN
  RAISE EXCEPTION 'Dashboard permission required' USING ERRCODE='42501';
 END IF;
 can_finance:=public.amanah_has_permission('reports.view') OR public.amanah_has_permission('materials.view');
 can_schedule:=public.amanah_has_permission('schedule.view');
 can_purchasing:=public.amanah_has_permission('purchasing.view') OR public.amanah_has_permission('purchasing.manage');
 can_payroll:=public.amanah_has_permission('payroll.approve') OR public.amanah_has_permission('payroll.manage');
 can_approve:=public.amanah_has_permission('approvals.view');
 can_equipment:=public.amanah_has_permission('master_data.equipment') OR public.amanah_has_permission('maintenance.view');
 can_maintenance:=public.amanah_has_permission('maintenance.view') OR public.amanah_has_permission('repairs.view');
 can_attendance:=public.amanah_has_permission('attendance.view');

 IF can_finance THEN
  SELECT jsonb_build_object('actual_cost',coalesce(sum(amount),0),
     'labor',coalesce(sum(amount) FILTER(WHERE cost_type='LABOR'),0),
     'materials',coalesce(sum(amount) FILTER(WHERE cost_type='MATERIAL'),0),
     'fuel',coalesce(sum(amount) FILTER(WHERE cost_type='FUEL'),0),
     'other',coalesce(sum(amount) FILTER(WHERE cost_type NOT IN ('LABOR','MATERIAL','FUEL')),0))
   INTO v_finance FROM public.project_cost_entries;
 END IF;

 IF can_schedule THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.project_id,'name',p.project_name,
    'progress',p.current_progress,'status',p.status,'target_date',p.target_completion,
    'overdue',p.target_completion < (now() AT TIME ZONE 'Asia/Manila')::date
            AND coalesce(p.current_progress,0)<100)
    ORDER BY p.project_name),'[]'::jsonb)
    INTO v_projects FROM public.projects p
    WHERE upper(coalesce(p.status,'')) NOT IN ('CANCELLED','COMPLETED','DONE');
 END IF;

 IF can_purchasing THEN
  SELECT jsonb_build_object(
   'open_orders',(SELECT count(*) FROM public.purchase_orders
     WHERE upper(status) NOT IN ('CLOSED','CANCELLED')),
   'unposted_received_lines',(
     SELECT count(*) FROM public.purchase_order_items i
     JOIN public.purchase_orders o ON o.purchase_order_id=i.purchase_order_id
     LEFT JOIN(SELECT purchase_order_item_id,sum(quantity) qty
       FROM public.amanah_po_material_cost_postings GROUP BY 1) posted
       ON posted.purchase_order_item_id=i.purchase_order_item_id
     WHERE o.purchase_type='PROJECT MATERIALS'
       AND o.status NOT IN ('CLOSED','CANCELLED')
       AND i.received_quantity>coalesce(posted.qty,0)
       AND coalesce(i.unit_price,0)>0),
   'received_unpriced_lines',(
     SELECT count(*) FROM public.purchase_order_items i
     JOIN public.purchase_orders o ON o.purchase_order_id=i.purchase_order_id
     WHERE o.purchase_type='PROJECT MATERIALS' AND o.status NOT IN ('CLOSED','CANCELLED')
       AND i.received_quantity>0 AND coalesce(i.unit_price,0)<=0)
  ) INTO v_purchasing;
 END IF;

 IF can_payroll THEN
  SELECT jsonb_build_object(
   'awaiting_approval',(SELECT count(*) FROM public.payroll_runs WHERE status='PENDING_APPROVAL'),
   'approved_unreleased_amount',(
     SELECT coalesce(sum(gross),0) FROM (
       SELECT i.gross_pay gross FROM public.payroll_items i
        JOIN public.payroll_runs r ON r.payroll_run_id=i.payroll_run_id
        LEFT JOIN public.payroll_paycheck_claims c ON c.payroll_item_id=i.payroll_item_id
        WHERE r.status='APPROVED' AND c.id IS NULL
       UNION ALL
       SELECT i.gross_pay FROM public.payroll_group_items i
        JOIN public.payroll_runs r ON r.payroll_run_id=i.payroll_run_id
        LEFT JOIN public.payroll_paycheck_claims c ON c.payroll_group_item_id=i.payroll_group_item_id
        WHERE r.status='APPROVED' AND c.id IS NULL
     ) due)
  ) INTO v_payroll;
 END IF;

 IF can_equipment THEN
  SELECT jsonb_build_object('total',count(*),
   'active',count(*) FILTER(WHERE upper(status) IN ('ACTIVE','AVAILABLE','OPERATIONAL')))
    INTO v_equipment FROM public.equipment;
 END IF;

 IF can_attendance THEN
  SELECT jsonb_build_object('on_site',count(*) FILTER(WHERE time_out IS NULL),
    'today_in',count(*) FILTER(WHERE attendance_date=(now() AT TIME ZONE 'Asia/Manila')::date))
   INTO v_attendance
   FROM public.attendance
   WHERE time_out IS NULL OR attendance_date=(now() AT TIME ZONE 'Asia/Manila')::date;
 END IF;

 IF can_approve THEN
  v_actions:=v_actions||jsonb_build_array(jsonb_build_object('label','Purchase requests awaiting GM decision',
    'count',(SELECT count(*) FROM public.purchase_requests WHERE status IN ('PENDING_APPROVAL','PENDING GM APPROVAL')),
    'href','approvals.html'));
  v_actions:=v_actions||jsonb_build_array(jsonb_build_object('label','Activities awaiting approval',
    'count',(SELECT count(*) FROM public.project_activities
      WHERE approval_status IN ('PENDING','PENDING_APPROVAL','PENDING APPROVAL')),
    'href','approvals.html'));
 END IF;
 IF can_purchasing THEN
  v_actions:=v_actions||jsonb_build_array(jsonb_build_object('label','Received materials ready for cost posting',
    'count',coalesce((v_purchasing->>'unposted_received_lines')::integer,0),
    'href','purchasing.html'));
 END IF;
 IF can_payroll THEN
  v_actions:=v_actions||jsonb_build_array(jsonb_build_object('label','Payroll runs awaiting finance approval',
    'count',coalesce((v_payroll->>'awaiting_approval')::integer,0),
    'href','finance-payroll.html'));
 END IF;
 IF can_maintenance THEN
  v_actions:=v_actions||jsonb_build_array(jsonb_build_object('label','Open repair requests',
    'count',(SELECT count(*) FROM public.repair_requests
      WHERE upper(status) NOT IN ('COMPLETED','CANCELLED','CLOSED','REJECTED')),
    'href','repair-requests.html'));
 END IF;

 RETURN jsonb_build_object('as_of',now(),'finance',v_finance,'projects',v_projects,
  'purchasing',v_purchasing,'payroll',v_payroll,'equipment',v_equipment,
  'attendance',v_attendance,'actions',v_actions,
  'permissions',jsonb_build_object('financial',can_finance,'schedule',can_schedule,
    'purchasing',can_purchasing,'payroll',can_payroll,
    'approvals',can_approve,'equipment',can_equipment,
    'maintenance',can_maintenance,'attendance',can_attendance,
    'cost_access',public.amanah_has_permission('materials.view'),
    'reports_access',public.amanah_has_permission('reports.view'),
    'payroll_approve',public.amanah_has_permission('payroll.approve'),
    'repairs_access',public.amanah_has_permission('repairs.view'),
    'maintenance_access',public.amanah_has_permission('maintenance.view')));
END;
$fn$;
REVOKE ALL ON FUNCTION public.amanah_dashboard_control_center() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amanah_dashboard_control_center() TO authenticated,service_role;