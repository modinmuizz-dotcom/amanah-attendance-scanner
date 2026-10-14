-- AMANAH Construction Management System
-- Lump-Sum actual project expense is recognized only at recorded cash payment.
-- A certified/GM-approved billing is NOT an expense until paid.
-- Advance, billing disbursement and retention release each post actual
-- money paid once, on the actual payment date; never the approved gross.
-- Existing non-lump project costs are untouched.

BEGIN;

-- Eliminate approval-triggered cost creation.
DROP TRIGGER IF EXISTS trg_lump_post_approved_cost
  ON public.amanah_lump_billings;
DROP FUNCTION IF EXISTS public.amanah_lump_post_approved_cost();

-- Existing partial unique index on reference_id LIKE 'LUMP-SUM:%'
-- also protects 'LUMP-SUM:PAYMENT:<uuid>' from duplicates.
CREATE OR REPLACE FUNCTION public.amanah_lump_post_actual_payment_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
DECLARE
  v_contract record;
  v_billing record;
  v_ref text;
  v_description text;
BEGIN
  -- Keep Project Cost synchronized if an authorized database administrator
  -- corrects or reverses a recorded payment in the future.
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.project_cost_entries
    WHERE reference_id='LUMP-SUM:PAYMENT:'||OLD.id::text;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  END IF;

  SELECT c.project_id,c.contract_type,c.scope_title,c.contractor_name
    INTO v_contract
  FROM public.amanah_lump_contracts c
  WHERE c.id=NEW.contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot post payment to Project Cost: contract was not found';
  END IF;

  IF NEW.payment_kind='BILLING' THEN
    SELECT b.id,b.status,b.milestone INTO v_billing
    FROM public.amanah_lump_billings b
    WHERE b.id=NEW.billing_id AND b.contract_id=NEW.contract_id;
    IF NOT FOUND OR v_billing.status<>'APPROVED' THEN
      RAISE EXCEPTION 'An approved billing is required before a billing payment can affect Project Cost';
    END IF;
  ELSIF NEW.payment_kind NOT IN ('ADVANCE','RETENTION') THEN
    RAISE EXCEPTION 'Unsupported lump-sum payment type';
  END IF;

  v_ref='LUMP-SUM:PAYMENT:'||NEW.id::text;
  v_description='PAID LUMP-SUM '||
    CASE WHEN v_contract.contract_type='DIRECT_LABOR' THEN 'DIRECT LABOR / PAKYAW'
         WHEN v_contract.contract_type='SUBCONTRACTOR' THEN 'SUBCONTRACTOR'
         ELSE v_contract.contract_type END||
    ' - '||v_contract.scope_title||
    ' / '||v_contract.contractor_name||' - '||
    CASE WHEN NEW.payment_kind='BILLING'
         THEN 'Progress billing: '||v_billing.milestone
         WHEN NEW.payment_kind='ADVANCE' THEN 'Mobilization advance paid'
         ELSE 'Retention released' END;

  INSERT INTO public.project_cost_entries (
    project_id,cost_date,cost_type,description,
    quantity,unit,unit_cost,amount,reference_id,notes
  ) VALUES (
    v_contract.project_id,
    NEW.paid_on,'LABOR',v_description,
    1,'PAYMENT',round(NEW.amount,2),round(NEW.amount,2),
    v_ref,
    'Actual lump-sum payment '||NEW.payment_kind||
    ' • Payment reference: '||NEW.payment_reference||
    ' • Contract: '||NEW.contract_id::text||
    CASE WHEN NEW.billing_id IS NOT NULL
         THEN ' • Approved billing: '||NEW.billing_id::text ELSE '' END
  )
  ON CONFLICT (reference_id) WHERE (reference_id LIKE 'LUMP-SUM:%')
  DO NOTHING;

  RETURN NEW;
END;
$body$;

DROP TRIGGER IF EXISTS trg_lump_post_actual_payment_cost
  ON public.amanah_lump_payments;
CREATE TRIGGER trg_lump_post_actual_payment_cost
AFTER INSERT OR UPDATE OR DELETE ON public.amanah_lump_payments
FOR EACH ROW EXECUTE FUNCTION public.amanah_lump_post_actual_payment_cost();

-- The original approved-billing entries are provisional, not evidence of
-- payment. Remove ONLY exact original billing-generated references.
-- The guard against manual edits is disabled solely within this transaction,
-- then immediately restored; the SQL migration is all-or-nothing.
ALTER TABLE public.project_cost_entries
  DISABLE TRIGGER trg_guard_lump_sum_project_cost;

DELETE FROM public.project_cost_entries e
USING public.amanah_lump_billings b
WHERE e.reference_id='LUMP-SUM:'||b.id::text
  AND e.cost_type='LABOR';

ALTER TABLE public.project_cost_entries
  ENABLE TRIGGER trg_guard_lump_sum_project_cost;

-- Backfill actual historical payment records, if any. Payment IDs give
-- each project cost a stable, unique audit reference.
DO $body$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM public.amanah_lump_payments ORDER BY created_at,id
  LOOP
    UPDATE public.amanah_lump_payments
       SET payment_reference=payment_reference
     WHERE id=r.id;
  END LOOP;
END;
$body$;

COMMIT;
