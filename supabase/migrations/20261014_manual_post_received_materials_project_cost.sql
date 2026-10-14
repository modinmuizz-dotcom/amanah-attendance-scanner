-- AMANAH: explicit posting of actually RECEIVED project materials to Project Cost.
-- Saving a Purchase Order or marking materials received never posts costs by itself.
-- Each press posts only the newly received, not-yet-posted quantity using the
-- current saved Unit Price. Previous postings are immutable (audited snapshots).
-- MAINTENANCE / REPAIR MATERIALS are excluded to avoid duplicating their
-- independent project-cost accounting paths.

BEGIN;

CREATE TABLE IF NOT EXISTS public.amanah_po_material_cost_postings (
  posting_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_item_id uuid NOT NULL
    REFERENCES public.purchase_order_items(purchase_order_item_id) ON DELETE RESTRICT,
  project_cost_entry_id uuid NOT NULL UNIQUE
    REFERENCES public.project_cost_entries(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity>0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price>0),
  amount numeric(14,2) NOT NULL CHECK (amount>=0),
  received_quantity_at_posting numeric(14,3) NOT NULL,
  posted_by uuid,
  posted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amanah_po_material_cost_posting_item
  ON public.amanah_po_material_cost_postings (purchase_order_item_id);
ALTER TABLE public.amanah_po_material_cost_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.amanah_po_material_cost_postings FROM PUBLIC,anon,authenticated;

-- No direct update or deletion of a linked, posted material cost from Project Cost.
-- Database administrators can still perform necessary reconciliations.
CREATE OR REPLACE FUNCTION public.amanah_guard_posted_material_project_cost()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $guard$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Posted material costs are managed by Purchase Order receipts and cannot be changed manually.'
      USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$guard$;

DROP TRIGGER IF EXISTS trg_amanah_guard_posted_material_cost
  ON public.project_cost_entries;
CREATE TRIGGER trg_amanah_guard_posted_material_cost
  BEFORE UPDATE OR DELETE ON public.project_cost_entries
  FOR EACH ROW
  WHEN (OLD.reference_id LIKE 'PO-MATERIAL-RECEIVED:%')
  EXECUTE FUNCTION public.amanah_guard_posted_material_project_cost();

-- Once posted, a previously received quantity cannot be reduced below the
-- accounted quantity. Supplier adjustments to price affect only future posts.
CREATE OR REPLACE FUNCTION public.amanah_guard_material_posted_quantity()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $guard$
DECLARE v_posted numeric;
BEGIN
  SELECT coalesce(sum(quantity),0) INTO v_posted
  FROM public.amanah_po_material_cost_postings
  WHERE purchase_order_item_id=OLD.purchase_order_item_id;
  IF NEW.received_quantity < v_posted OR NEW.quantity < v_posted THEN
    RAISE EXCEPTION 'Cannot reduce received/ordered quantity below % already posted to Project Cost',v_posted;
  END IF;
  RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS trg_amanah_guard_material_posted_quantity
  ON public.purchase_order_items;
CREATE TRIGGER trg_amanah_guard_material_posted_quantity
  BEFORE UPDATE OF received_quantity,quantity ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.amanah_guard_material_posted_quantity();

-- Used to show a precise, permission-filtered, live preview in Purchase Order Details.
CREATE OR REPLACE FUNCTION public.amanah_po_received_material_cost_status(p_purchase_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $body$
DECLARE v_order record; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
     public.amanah_has_permission('purchasing.view') OR
     public.amanah_has_permission('purchasing.manage') OR
     public.amanah_has_permission('purchasing.approve')
  ) THEN
    RAISE EXCEPTION 'Not authorized to view purchase-order material costs'
      USING ERRCODE='42501';
  END IF;
  SELECT po_no,purchase_type,status INTO v_order
  FROM public.purchase_orders WHERE purchase_order_id=p_purchase_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase Order not found'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
     'purchase_order_item_id',s.purchase_order_item_id,
     'material_name',s.material_name,'unit',s.unit,
     'received_quantity',s.received_quantity,
     'posted_quantity',s.posted_quantity,
     'unposted_received_quantity',s.unposted_quantity,
     'unit_price',s.unit_price,'unposted_amount',
       CASE WHEN s.unit_price>0 AND s.unposted_quantity>0
            THEN round(s.unposted_quantity*s.unit_price,2) ELSE 0 END
   ) ORDER BY s.line_no),'[]'::jsonb)
   INTO v_result
   FROM (
     SELECT i.purchase_order_item_id,i.line_no,i.material_name,i.unit,
            i.received_quantity,i.unit_price,
            coalesce(p.quantity,0) AS posted_quantity,
            greatest(coalesce(i.received_quantity,0)-coalesce(p.quantity,0),0)
              AS unposted_quantity
     FROM public.purchase_order_items i
     LEFT JOIN (
       SELECT purchase_order_item_id,sum(quantity) AS quantity
       FROM public.amanah_po_material_cost_postings
       GROUP BY purchase_order_item_id
     ) p ON p.purchase_order_item_id=i.purchase_order_item_id
     WHERE i.purchase_order_id=p_purchase_order_id
   ) s;

  RETURN jsonb_build_object(
    'po_no',v_order.po_no,
    'eligible_project_materials',upper(coalesce(v_order.purchase_type,''))='PROJECT MATERIALS'
        AND v_order.status NOT IN ('CANCELLED','CLOSED'),
    'items',v_result
  );
END;
$body$;

-- One atomic, permission-checked action for all currently received and priced
-- items on a PROJECT MATERIALS PO. Lock PO first to serialize repeated clicks.
CREATE OR REPLACE FUNCTION public.amanah_post_received_materials_project_cost(p_purchase_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $body$
DECLARE
  v_order public.purchase_orders%ROWTYPE;
  v_item record;
  v_posted numeric;
  v_quantity numeric(14,3);
  v_amount numeric(14,2);
  v_cost_id uuid;
  v_posting_id uuid;
  v_count integer :=0;
  v_total numeric(14,2):=0;
  v_lines jsonb:='[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.amanah_has_permission('purchasing.manage') THEN
    RAISE EXCEPTION 'Only authorized Purchasing Officers can post received material costs'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_order FROM public.purchase_orders
  WHERE purchase_order_id=p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase Order not found'; END IF;
  IF upper(coalesce(v_order.purchase_type,'')) <> 'PROJECT MATERIALS' THEN
    RAISE EXCEPTION 'Only Project Materials can be posted here; repair and maintenance costs use their own workflows';
  END IF;
  IF v_order.status IN ('CANCELLED','CLOSED') THEN
    RAISE EXCEPTION 'Cancelled or closed Purchase Orders cannot post new material costs';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.projects WHERE project_id=v_order.project_id) THEN
    RAISE EXCEPTION 'Purchase Order is not linked to a valid project';
  END IF;

  FOR v_item IN
    SELECT * FROM public.purchase_order_items
    WHERE purchase_order_id=p_purchase_order_id
    ORDER BY line_no FOR UPDATE
  LOOP
    SELECT coalesce(sum(quantity),0) INTO v_posted
    FROM public.amanah_po_material_cost_postings
    WHERE purchase_order_item_id=v_item.purchase_order_item_id;

    IF v_posted>coalesce(v_item.received_quantity,0) THEN
      RAISE EXCEPTION 'Material % has fewer received units than previously posted',v_item.material_name;
    END IF;
    v_quantity:=coalesce(v_item.received_quantity,0)-v_posted;
    IF v_quantity<=0 OR v_item.unit_price IS NULL OR v_item.unit_price<=0 THEN
      CONTINUE;
    END IF;
    IF v_quantity>v_item.quantity THEN
      RAISE EXCEPTION 'Received quantity is above ordered quantity for %',v_item.material_name;
    END IF;
    v_amount:=round(v_quantity*v_item.unit_price,2);
    IF v_amount<=0 THEN CONTINUE; END IF;
    v_posting_id:=gen_random_uuid();
    INSERT INTO public.project_cost_entries(
      project_id,cost_date,cost_type,description,quantity,unit,unit_cost,
      amount,reference_id,notes
    ) VALUES (
      v_order.project_id,coalesce(v_item.received_date,current_date),'MATERIAL',
      'Received material - '||v_item.material_name||
        CASE WHEN nullif(btrim(coalesce(v_item.specifications,'')),'') IS NULL
             THEN '' ELSE ' ('||v_item.specifications||')' END,
      v_quantity,v_item.unit,v_item.unit_price,v_amount,
      'PO-MATERIAL-RECEIVED:'||v_posting_id::text,
      'PO '||v_order.po_no||' • Supplier: '||v_order.supplier_name||
      ' • Received units newly posted: '||v_quantity::text||
      ' • Delivery ref: '||coalesce(v_item.delivery_reference,'—')||
      ' • Posted manually by authorized Purchasing Officer'
    ) RETURNING id INTO v_cost_id;

    INSERT INTO public.amanah_po_material_cost_postings(
      posting_id,purchase_order_item_id,project_cost_entry_id,
      quantity,unit_price,amount,received_quantity_at_posting,posted_by
    ) VALUES (
      v_posting_id,v_item.purchase_order_item_id,v_cost_id,
      v_quantity,v_item.unit_price,v_amount,v_item.received_quantity,auth.uid()
    );
    v_count:=v_count+1;
    v_total:=v_total+v_amount;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'material',v_item.material_name,'quantity',v_quantity,
      'unit_price',v_item.unit_price,'amount',v_amount
    ));
  END LOOP;
  RETURN jsonb_build_object('po_no',v_order.po_no,'posted_lines',v_count,
                            'posted_amount',v_total,'items',v_lines);
END;
$body$;

REVOKE ALL ON FUNCTION public.amanah_po_received_material_cost_status(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.amanah_post_received_materials_project_cost(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amanah_po_received_material_cost_status(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.amanah_post_received_materials_project_cost(uuid) TO authenticated,service_role;

COMMIT;
