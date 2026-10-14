-- AMANAH Construction Services
-- Post project LABOR expense only after an approved paycheck is released.
-- Fuel and independently recorded maintenance/repair/lump-sum expenses are unchanged.
-- Paid payroll lines are allocated to their recorded attendance project(s); 
-- group labor is tied to the project chosen in its payroll item.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_cost_paid_employee_paycheck
  ON public.project_cost_entries(reference_id)
  WHERE reference_id LIKE 'PAYROLL-EMPLOYEE:%';

-- Keep attendance responsible for FUEL only, not provisional hourly labor.
CREATE OR REPLACE FUNCTION public.sync_attendance_project_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
DECLARE
  v_fuel_cost numeric(15,2);
  v_key text;
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.project_cost_entries
     WHERE reference_id LIKE 'AUTO-ATTENDANCE:' || OLD.attendance_id || ':%';
    RETURN OLD;
  END IF;

  DELETE FROM public.project_cost_entries
   WHERE reference_id LIKE 'AUTO-ATTENDANCE:' || NEW.attendance_id || ':%';

  IF upper(coalesce(NEW.status,'')) <> 'COMPLETED'
     OR nullif(btrim(coalesce(NEW.project_id,'')),'') IS NULL THEN
    RETURN NEW;
  END IF;

  v_fuel_cost := CASE WHEN coalesce(NEW.fuel_used,false)
                  THEN round(coalesce(NEW.fuel_amount,0),2)
                  ELSE 0 END;
  IF v_fuel_cost > 0 THEN
    v_key := 'AUTO-ATTENDANCE:' || NEW.attendance_id || ':FUEL';
    INSERT INTO public.project_cost_entries (
      project_id,cost_date,cost_type,description,quantity,unit,
      unit_cost,amount,reference_id,notes
    ) VALUES (
      NEW.project_id,NEW.attendance_date,'FUEL',
      'Automatic fuel cost - '||coalesce(NEW.equipment_name,NEW.equipment_id,'Attendance'),
      greatest(coalesce(NEW.fuel_quantity,0),0),'LITER',
      CASE WHEN coalesce(NEW.fuel_quantity,0)>0
           THEN round(v_fuel_cost / NEW.fuel_quantity,2)
           ELSE 0 END,
      v_fuel_cost,v_key,
      'Automatically generated from Attendance '||NEW.attendance_id
    );
  END IF;
  RETURN NEW;
END;
$body$;

-- Group Labor is never billable to Project Cost merely because Finance
-- approved the run. It requires a real row in payroll_paycheck_claims.
CREATE OR REPLACE FUNCTION public.sync_payroll_group_cost(p_group_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
DECLARE
  r record;
  v_reference text := 'GROUP-LABOR:'||p_group_item_id::text;
BEGIN
  SELECT g.project_id,g.group_name,g.activity_description,
         g.meters_accomplished,g.rate_per_meter,g.gross_pay,
         pr.period_start,pr.period_end,pr.status AS payroll_status,
         c.id AS claim_id,c.amount AS paid_amount,c.released_on,c.payment_reference
    INTO r
    FROM public.payroll_group_items g
    JOIN public.payroll_runs pr ON pr.payroll_run_id=g.payroll_run_id
    LEFT JOIN public.payroll_paycheck_claims c
           ON c.payroll_group_item_id=g.payroll_group_item_id
   WHERE g.payroll_group_item_id=p_group_item_id;

  IF NOT FOUND OR r.payroll_status <> 'APPROVED' OR r.claim_id IS NULL THEN
    DELETE FROM public.project_cost_entries WHERE reference_id=v_reference;
    RETURN;
  END IF;

  INSERT INTO public.project_cost_entries (
    project_id,cost_date,cost_type,description,quantity,unit,
    unit_cost,amount,reference_id,notes
  ) VALUES (
    r.project_id,r.released_on,'LABOR',
    'Paid Group Labor: '||r.group_name||
      CASE WHEN nullif(btrim(coalesce(r.activity_description,'')),'') IS NOT NULL
           THEN ' - '||btrim(r.activity_description) ELSE '' END,
    r.meters_accomplished,'METER',r.rate_per_meter,r.paid_amount,
    v_reference,
    'PAYROLL PAID '||r.released_on::text||' • Reference: '||r.payment_reference||
    ' • Payroll period '||r.period_start::text||' to '||r.period_end::text
  )
  ON CONFLICT (reference_id) WHERE (reference_id LIKE 'GROUP-LABOR:%')
  DO UPDATE SET
    project_id=EXCLUDED.project_id,cost_date=EXCLUDED.cost_date,
    cost_type='LABOR',description=EXCLUDED.description,
    quantity=EXCLUDED.quantity,unit='METER',
    unit_cost=EXCLUDED.unit_cost,amount=EXCLUDED.amount,notes=EXCLUDED.notes;
END;
$body$;

-- Allocate a paid employee paycheck to the project(s) from its own payroll
-- attendance snapshot. Daily pay uses recorded shifts; hourly pay uses time.
-- Allocation is in whole centavos, with exact total reconciliation.
-- Employees without a valid project reference cannot be assigned automatically:
-- do not invent a project or place unallocated wages in the wrong project.
CREATE OR REPLACE FUNCTION public.amanah_sync_paid_employee_project_cost(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
DECLARE
  v_item record;
  v_paid record;
  v_cents bigint;
  r record;
  v_reference text;
BEGIN
  SELECT i.payroll_item_id,i.payroll_run_id,i.employee_id,i.employee_name,
         i.rate_type,i.attendance_ids,pr.status
    INTO v_item
    FROM public.payroll_items i
    JOIN public.payroll_runs pr ON pr.payroll_run_id=i.payroll_run_id
   WHERE i.payroll_item_id=p_item_id;

  IF NOT FOUND OR v_item.status <> 'APPROVED' THEN RETURN; END IF;

  SELECT c.id,c.amount,c.released_on,c.payment_reference
    INTO v_paid FROM public.payroll_paycheck_claims c
   WHERE c.payroll_item_id=p_item_id;

  IF NOT FOUND OR coalesce(v_paid.amount,0)<=0 THEN RETURN; END IF;
  v_cents := round(v_paid.amount*100)::bigint;

  FOR r IN
    WITH attendance_ids AS (
      SELECT DISTINCT x.id
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_item.attendance_ids)='array'
             THEN v_item.attendance_ids ELSE '[]'::jsonb END
      ) AS x(id)
    ), project_weights AS (
      SELECT a.project_id,
             SUM(CASE WHEN v_item.rate_type='DAILY' THEN 1::numeric
                      ELSE greatest(coalesce(a.total_hours,0),0)::numeric
                  END) AS raw_weight
      FROM attendance_ids refs
      JOIN public.attendance a ON a.attendance_id=refs.id
      JOIN public.projects proj ON proj.project_id=a.project_id
      WHERE a.employee_id=v_item.employee_id
        AND upper(coalesce(a.status,''))='COMPLETED'
        AND nullif(btrim(coalesce(a.project_id,'')),'') IS NOT NULL
      GROUP BY a.project_id
    ), weights AS (
      SELECT project_id,
             CASE WHEN raw_weight>0 THEN raw_weight ELSE 1::numeric END AS weight
      FROM project_weights
    ), fractions AS (
      SELECT project_id,
             floor(v_cents::numeric * weight /
                   nullif(sum(weight) OVER(),0))::bigint AS base_cents,
             (v_cents::numeric * weight /
                   nullif(sum(weight) OVER(),0)) -
               floor(v_cents::numeric * weight /
                   nullif(sum(weight) OVER(),0)) AS fractional_part
      FROM weights
    ), allocations AS (
      SELECT project_id,base_cents,
             row_number() OVER (ORDER BY fractional_part DESC,project_id) AS rank,
             v_cents-sum(base_cents) OVER () AS remaining_cents
      FROM fractions
    )
    SELECT project_id,
           (base_cents+CASE WHEN rank<=remaining_cents THEN 1 ELSE 0 END)::numeric/100 AS amount
    FROM allocations
  LOOP
    IF r.amount > 0 THEN
      v_reference := 'PAYROLL-EMPLOYEE:'||v_paid.id::text||':'||r.project_id;
      INSERT INTO public.project_cost_entries (
        project_id,cost_date,cost_type,description,
        quantity,unit,unit_cost,amount,reference_id,notes
      ) VALUES (
        r.project_id,v_paid.released_on,'LABOR',
        'Paid payroll - '||v_item.employee_name,
        1,'PAYCHECK',r.amount,r.amount,v_reference,
        'Released on '||v_paid.released_on::text||
        ' • Payment ref: '||v_paid.payment_reference||
        ' • Payroll run: '||v_item.payroll_run_id::text||
        ' • Allocated from linked attendance by project'
      )
      ON CONFLICT (reference_id) WHERE (reference_id LIKE 'PAYROLL-EMPLOYEE:%')
      DO UPDATE SET
        project_id=EXCLUDED.project_id,cost_date=EXCLUDED.cost_date,
        cost_type='LABOR',description=EXCLUDED.description,
        quantity=EXCLUDED.quantity,unit='PAYCHECK',
        unit_cost=EXCLUDED.unit_cost,amount=EXCLUDED.amount,notes=EXCLUDED.notes;
    END IF;
  END LOOP;
END;
$body$;

-- Payroll cost records belong to the payroll ledger, not manual edits in
-- Project Cost. Internal SECURITY DEFINER functions may synchronize them.
CREATE OR REPLACE FUNCTION public.guard_payroll_generated_project_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $body$
DECLARE
  v_managed boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    v_managed:=coalesce(new.reference_id LIKE 'GROUP-LABOR:%' OR
                        new.reference_id LIKE 'PAYROLL-EMPLOYEE:%',false);
  ELSIF TG_OP='DELETE' THEN
    v_managed:=coalesce(old.reference_id LIKE 'GROUP-LABOR:%' OR
                        old.reference_id LIKE 'PAYROLL-EMPLOYEE:%',false);
  ELSE
    v_managed:=coalesce(old.reference_id LIKE 'GROUP-LABOR:%' OR
                        old.reference_id LIKE 'PAYROLL-EMPLOYEE:%' OR
                        new.reference_id LIKE 'GROUP-LABOR:%' OR
                        new.reference_id LIKE 'PAYROLL-EMPLOYEE:%',false);
  END IF;

  IF v_managed AND pg_trigger_depth()<=1 AND current_user<>'postgres' THEN
    RAISE EXCEPTION 'Paid payroll project costs cannot be manually modified or deleted.'
      USING errcode='23514';
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$body$;

-- The receipt is the accounting event. Approval alone never posts labor.
CREATE OR REPLACE FUNCTION public.amanah_post_paid_payroll_cost_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
BEGIN
  IF NEW.payroll_item_id IS NOT NULL THEN
    PERFORM public.amanah_sync_paid_employee_project_cost(NEW.payroll_item_id);
  ELSIF NEW.payroll_group_item_id IS NOT NULL THEN
    PERFORM public.sync_payroll_group_cost(NEW.payroll_group_item_id);
  END IF;
  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_post_paid_payroll_cost_on_claim
  ON public.payroll_paycheck_claims;
CREATE TRIGGER trg_post_paid_payroll_cost_on_claim
AFTER INSERT ON public.payroll_paycheck_claims
FOR EACH ROW EXECUTE FUNCTION public.amanah_post_paid_payroll_cost_on_claim();

-- Protect the reconciliation endpoints from direct browser RPC use.
REVOKE ALL ON FUNCTION public.amanah_sync_paid_employee_project_cost(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_payroll_group_cost(uuid) FROM PUBLIC,anon,authenticated;

-- Remove old attendance-generated provisional labor (never actual payroll).
-- Real, already-paid payroll claims are restored below as paid expenses.
DELETE FROM public.project_cost_entries
 WHERE cost_type='LABOR' AND reference_id LIKE 'AUTO-ATTENDANCE:%:LABOR';

-- Bring previously approved Group Labor rows into compliance:
-- approved but unpaid -> no expense; paid -> dated on release.
DO $body$
DECLARE r record;
BEGIN
  FOR r IN SELECT payroll_group_item_id FROM public.payroll_group_items LOOP
    PERFORM public.sync_payroll_group_cost(r.payroll_group_item_id);
  END LOOP;
  -- Backfill already released employee paychecks without duplicating costs.
  FOR r IN
    SELECT c.payroll_item_id
    FROM public.payroll_paycheck_claims c
    WHERE c.payroll_item_id IS NOT NULL
  LOOP
    PERFORM public.amanah_sync_paid_employee_project_cost(r.payroll_item_id);
  END LOOP;
END;
$body$;
COMMIT;
