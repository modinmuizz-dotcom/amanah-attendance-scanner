-- AMANAH phased dashboard release (one shared UI, permission-scoped data).
-- Phase 1: executive and financial metrics
-- Phase 2: project progress and visibility
-- Phase 3: alerts, workforce, equipment and purchasing/payments
-- No source transactions are modified.
CREATE OR REPLACE FUNCTION public.amanah_get_control_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
 v_user uuid:=auth.uid();
 v_day date:=(now() AT TIME ZONE 'Asia/Manila')::date;
 v_perms text[];
 v_fin boolean;v_prog boolean;v_work boolean;v_equip boolean;v_buy boolean;
 v_pay boolean;v_gm boolean;v_repair boolean;v_maint boolean;
 v_project_count int:=0;v_working int:=0;v_active_equipment int:=0;
 v_cost numeric:=0;v_estimate numeric:=0;v_covered_cost numeric:=0;v_estimated_projects int:=0;v_missing_estimate int:=0;
 v_fiscal jsonb:='{}';v_projects jsonb:='[]';
 v_workforce jsonb:='{}';v_equipment jsonb:='{}';v_procurement jsonb:='{}';v_payments jsonb:='{}';
 v_alerts jsonb:='[]';v_progress jsonb:='{}';
 v_active int:=0;v_late int:=0;v_pending int:=0;v_repair_open int:=0;
 v_await_post int:=0;v_unpriced int:=0;v_ready numeric:=0;v_po_pending int:=0;
 v_payroll_pending int:=0;v_unreleased numeric:=0;v_lump_unpaid numeric:=0;
 v_attendance_count int:=0;v_completed int:=0;v_staff int:=0;
BEGIN
 IF v_user IS NULL OR NOT public.amanah_has_permission('dashboard.view') THEN
   RAISE EXCEPTION 'Dashboard access denied for this account' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(array_agg(p.permission_key),ARRAY[]::text[]) INTO v_perms
 FROM public.amanah_user_roles ur
 JOIN public.amanah_role_permissions rp ON rp.role_id=ur.role_id
 JOIN public.amanah_permissions p ON p.permission_id=rp.permission_id
 WHERE ur.auth_user_id=v_user;
 v_fin:=v_perms && ARRAY['materials.view','reports.view','payroll.approve']::text[];
 v_prog:=v_perms && ARRAY['schedule.view','reports.view','master_data.projects']::text[];
 v_work:=v_perms && ARRAY['attendance.view','activities.view']::text[];
 v_equip:=v_perms && ARRAY['maintenance.view','master_data.equipment','equipment_history.view']::text[];
 v_buy:=v_perms && ARRAY['purchasing.view','purchasing.manage']::text[];
 v_pay:=v_perms && ARRAY['payroll.view','payroll.approve','payroll.manage']::text[];
 v_gm:=v_perms && ARRAY['approvals.view','schedule.approve','maintenance.approve']::text[];
 v_repair:=v_perms && ARRAY['repairs.view','repairs.manage']::text[];
 v_maint:=v_perms && ARRAY['maintenance.view','maintenance.manage']::text[];

 SELECT count(*) FILTER(WHERE upper(coalesce(status,''))='ACTIVE') INTO v_project_count
 FROM public.projects;
 SELECT count(*) FILTER(WHERE upper(coalesce(status,''))='ACTIVE') INTO v_active_equipment
 FROM public.equipment;

 IF v_work THEN
   SELECT count(*) FILTER(WHERE upper(coalesce(status,''))='IN'),
          count(*) FILTER(WHERE upper(coalesce(status,''))='COMPLETED'),
          count(*)
   INTO v_working,v_completed,v_attendance_count
   FROM public.attendance WHERE attendance_date=v_day;
   SELECT count(*) INTO v_staff FROM public.employees
      WHERE upper(coalesce(status,''))='ACTIVE';
   v_workforce:=jsonb_build_object('currently_working',v_working,
     'completed_today',v_completed,'today_attendance',v_attendance_count,
     'active_employees',v_staff);
 END IF;

 IF v_fin THEN
   SELECT coalesce(sum(coalesce(actual_cost,0)),0),
          coalesce(sum(estimate_cost),0),
          coalesce(sum(actual_cost) FILTER (WHERE estimate_cost IS NOT NULL),0),
          count(*) FILTER(WHERE estimate_cost IS NOT NULL),
          count(*) FILTER(WHERE estimate_cost IS NULL)
    INTO v_cost,v_estimate,v_covered_cost,v_estimated_projects,v_missing_estimate
    FROM public.get_dashboard_project_cost_chart();
   v_fiscal:=jsonb_build_object('actual_cost',v_cost,'saved_estimates',v_estimate,
      'remaining_estimated_budget',v_estimate-v_covered_cost,
      'actual_on_estimated_projects',v_covered_cost,'projects_missing_estimates',v_missing_estimate,
      'projects_with_estimates',v_estimated_projects,
      'budget_coverage_note','Budget remaining only compares projects with saved estimates; actual total includes all projects');
   v_fiscal:=v_fiscal||jsonb_build_object('breakdown',(
     SELECT coalesce(jsonb_agg(jsonb_build_object('type',cost_type,'amount',total)
       ORDER BY total DESC),'[]'::jsonb)
     FROM (SELECT cost_type,round(sum(amount),2) total
       FROM public.project_cost_entries GROUP BY cost_type) s
   ));
 END IF;

 IF v_prog OR v_fin THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object(
       'id',p.project_id,'name',p.project_name,'type',p.project_type,
       'status',p.status,'progress',CASE WHEN v_prog THEN p.current_progress ELSE NULL END,
       'progress_source',CASE WHEN v_prog THEN 'Project Master recorded progress' ELSE NULL END,
       'target',CASE WHEN v_prog THEN p.target_completion ELSE NULL END,
       'overdue',CASE WHEN v_prog THEN
           (p.target_completion<v_day AND upper(coalesce(p.status,''))='ACTIVE') ELSE false END,
       'actual',CASE WHEN v_fin THEN coalesce(f.actual_cost,0) ELSE NULL END,
       'estimate',CASE WHEN v_fin THEN f.estimate_cost ELSE NULL END
     ) ORDER BY p.project_name),'[]'::jsonb)
     INTO v_projects
     FROM public.projects p
     LEFT JOIN public.get_dashboard_project_cost_chart() f ON f.project_id=p.project_id;
 END IF;

 IF v_prog THEN
   SELECT count(*) FILTER(WHERE activity_date<v_day AND
         upper(coalesce(activity_status,'')) NOT IN ('DONE','COMPLETED','CANCELLED')),
         count(*) FILTER(WHERE upper(coalesce(activity_status,''))='IN PROGRESS')
   INTO v_late,v_active FROM public.project_activities
   WHERE upper(coalesce(approval_status,''))='APPROVED';
   v_progress:=jsonb_build_object('overdue_activities',v_late,'active_activities',v_active,
     'source','Recorded Project Master progress; no cost-derived physical percentages');
   IF v_late>0 THEN v_alerts:=v_alerts||jsonb_build_array(
     jsonb_build_object('label','Overdue approved activities','count',v_late,
       'url','project-schedule.html','type','warning'));END IF;
 END IF;

 IF v_gm THEN
   SELECT
    (SELECT count(*) FROM public.purchase_requests
      WHERE upper(coalesce(status,'')) IN ('PENDING APPROVAL','PENDING_APPROVAL','SUBMITTED'))
    +(SELECT count(*) FROM public.project_activities
      WHERE upper(coalesce(approval_status,'')) IN ('PENDING APPROVAL','PENDING_APPROVAL','SUBMITTED'))
    +(SELECT count(*) FROM public.equipment_maintenance
      WHERE upper(coalesce(approval_status,'')) IN ('PENDING APPROVAL','PENDING_APPROVAL','SUBMITTED'))
   INTO v_pending;
   IF v_pending>0 THEN v_alerts:=v_alerts||jsonb_build_array(
     jsonb_build_object('label','Items awaiting General Manager decision',
       'count',v_pending,'url','approvals.html','type','warning'));END IF;
 END IF;

 IF v_equip OR v_maint OR v_repair THEN
   SELECT count(*) FILTER (WHERE upper(coalesce(status,'')) NOT IN
       ('CLOSED','CANCELLED','COMPLETED','REJECTED'))
   INTO v_repair_open FROM public.repair_requests;
   v_equipment:=jsonb_build_object('active_equipment',v_active_equipment,'open_repairs',v_repair_open);
   IF (v_repair OR v_maint) AND v_repair_open>0 THEN v_alerts:=v_alerts||jsonb_build_array(
      jsonb_build_object('label','Equipment repair requests still open','count',v_repair_open,
         'url','repair-requests.html','type','warning'));END IF;
 END IF;

 IF v_buy THEN
   SELECT count(*) FILTER(WHERE upper(coalesce(status,'')) NOT IN
     ('CLOSED','CANCELLED','RECEIVED')) INTO v_po_pending FROM public.purchase_orders;
   SELECT count(*) FILTER (WHERE i.received_quantity>coalesce(post.qty,0)
                                  AND i.unit_price>0),
          count(*) FILTER (WHERE i.received_quantity>coalesce(post.qty,0)
                                  AND coalesce(i.unit_price,0)<=0),
          coalesce(sum(round(greatest(i.received_quantity-coalesce(post.qty,0),0)
                                    *i.unit_price,2)) FILTER
               (WHERE i.unit_price>0),0)
   INTO v_await_post,v_unpriced,v_ready
   FROM public.purchase_orders po JOIN public.purchase_order_items i
     ON i.purchase_order_id=po.purchase_order_id
   LEFT JOIN (SELECT purchase_order_item_id,sum(quantity) qty
        FROM public.amanah_po_material_cost_postings GROUP BY purchase_order_item_id) post
      ON post.purchase_order_item_id=i.purchase_order_item_id
   WHERE po.purchase_type='PROJECT MATERIALS' AND po.status NOT IN ('CANCELLED','CLOSED');
   v_procurement:=jsonb_build_object('active_orders',v_po_pending,
     'received_lines_ready_to_post',v_await_post,
     'received_lines_missing_price',v_unpriced,'ready_to_post_amount',v_ready);
   IF v_await_post>0 THEN v_alerts:=v_alerts||jsonb_build_array(
     jsonb_build_object('label','Received materials ready for cost posting',
       'count',v_await_post,'url','purchasing.html','type','action'));END IF;
   IF v_unpriced>0 THEN v_alerts:=v_alerts||jsonb_build_array(
     jsonb_build_object('label','Received materials missing Unit Price',
       'count',v_unpriced,'url','purchasing.html','type','warning'));END IF;
 END IF;

 IF v_pay THEN
   SELECT count(*) INTO v_payroll_pending FROM public.payroll_runs
      WHERE upper(coalesce(status,'')) IN ('SUBMITTED','PENDING APPROVAL','PENDING_APPROVAL');
   SELECT coalesce(sum(greatest(coalesce(lines.gross,0)-coalesce(payments.paid,0),0)),0)
   INTO v_unreleased
   FROM public.payroll_runs r
   LEFT JOIN LATERAL (
     SELECT (SELECT coalesce(sum(i.gross_pay),0) FROM public.payroll_items i WHERE i.payroll_run_id=r.payroll_run_id)
       +(SELECT coalesce(sum(g.gross_pay),0) FROM public.payroll_group_items g WHERE g.payroll_run_id=r.payroll_run_id) AS gross
   ) lines ON true
   LEFT JOIN LATERAL (
     SELECT coalesce(sum(c.amount),0) paid FROM public.payroll_paycheck_claims c
        WHERE c.payroll_run_id=r.payroll_run_id
   ) payments ON true
   WHERE r.status='APPROVED';
   v_payments:=jsonb_build_object('awaiting_financial_approval',v_payroll_pending,
                                  'approved_paychecks_unreleased',v_unreleased);
   IF v_payroll_pending>0 AND v_perms @> ARRAY['payroll.approve']::text[] THEN
     v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
       'label','Payroll runs awaiting approval','count',v_payroll_pending,
       'url','finance-payroll.html','type','action'));END IF;
 END IF;
 IF v_fin THEN
   SELECT coalesce(sum(greatest(b.payable_amount-coalesce(t.amount,0),0)),0)
   INTO v_lump_unpaid
   FROM public.amanah_lump_billings b
   LEFT JOIN LATERAL(
     SELECT coalesce(sum(p.amount),0) amount FROM public.amanah_lump_payments p
     WHERE p.billing_id=b.id AND p.payment_kind='BILLING'
   )t ON true WHERE b.status='APPROVED';
   v_fiscal:=v_fiscal||jsonb_build_object('approved_unpaid_lump_billings',v_lump_unpaid);
 END IF;

 RETURN jsonb_build_object(
  'as_of',to_char(now() AT TIME ZONE 'Asia/Manila','YYYY-MM-DD HH24:MI'),
  'timezone','Asia/Manila',
  'permissions',jsonb_build_object(
    'financial',v_fin,'progress',v_prog,'workforce',v_work,
    'equipment',v_equip,'purchasing',v_buy,'payroll',v_pay,
    'approvals',v_gm,'repairs',v_repair,'maintenance',v_maint),
  'overview',jsonb_build_object('active_projects',v_project_count,
    'currently_working',CASE WHEN v_work THEN v_working ELSE NULL END,
    'active_equipment',CASE WHEN v_equip THEN v_active_equipment ELSE NULL END,
    'actual_cost',CASE WHEN v_fin THEN v_cost ELSE NULL END),
  'financial',v_fiscal,'projects',v_projects,'progress',v_progress,
  'workforce',v_workforce,'equipment',v_equipment,
  'purchasing',v_procurement,'payroll',v_payments,'alerts',v_alerts);
END;
$function$;
REVOKE ALL ON FUNCTION public.amanah_get_control_dashboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amanah_get_control_dashboard() TO authenticated,service_role;
