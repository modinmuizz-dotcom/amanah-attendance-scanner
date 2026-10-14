-- Save a quoted Unit Price even after the supplier availability and receiving
-- status have been locked. No receipt/supply quantities or statuses change.
CREATE OR REPLACE FUNCTION public.amanah_save_po_item_unit_price(
  p_purchase_order_item_id uuid,
  p_unit_price numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
 v_item public.purchase_order_items%ROWTYPE;
 v_order public.purchase_orders%ROWTYPE;
 v_subtotal numeric(14,2);
 v_posted numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.amanah_has_permission('purchasing.manage') THEN
   RAISE EXCEPTION 'Only an authorized Purchasing Officer can save supplier prices'
     USING ERRCODE='42501';
 END IF;
 IF p_unit_price IS NULL OR p_unit_price<=0 OR p_unit_price>99999999999 THEN
   RAISE EXCEPTION 'Enter a valid Unit Price greater than zero';
 END IF;
 -- Lock parent first (same lock order as posting and PO edit functions).
 SELECT po.* INTO v_order FROM public.purchase_orders po
 JOIN public.purchase_order_items i ON i.purchase_order_id=po.purchase_order_id
 WHERE i.purchase_order_item_id=p_purchase_order_item_id FOR UPDATE OF po;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase Order not found'; END IF;
 IF v_order.status IN ('CANCELLED','CLOSED') THEN
   RAISE EXCEPTION 'Cancelled or closed orders cannot be repriced';
 END IF;
 SELECT * INTO v_item FROM public.purchase_order_items
 WHERE purchase_order_item_id=p_purchase_order_item_id
   AND purchase_order_id=v_order.purchase_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase Order item not found'; END IF;
 SELECT coalesce(sum(quantity),0) INTO v_posted
 FROM public.amanah_po_material_cost_postings
 WHERE purchase_order_item_id=v_item.purchase_order_item_id;

 UPDATE public.purchase_order_items SET unit_price=round(p_unit_price,2)
 WHERE purchase_order_item_id=v_item.purchase_order_item_id;

 SELECT round(coalesce(sum(coalesce(line_total,0)),0),2)
 INTO v_subtotal FROM public.purchase_order_items
 WHERE purchase_order_id=v_order.purchase_order_id;
 UPDATE public.purchase_orders SET
    subtotal=v_subtotal,
    grand_total=v_subtotal+coalesce(v_order.tax_amount,0)+coalesce(v_order.other_charges,0),
    updated_at=now()
 WHERE purchase_order_id=v_order.purchase_order_id;

 RETURN jsonb_build_object(
   'po_no',v_order.po_no,'unit_price',round(p_unit_price,2),
   'subtotal',v_subtotal,'previously_posted_quantity',v_posted,
   'newly_receivable_quantity',greatest(v_item.received_quantity-v_posted,0)
 );
END;
$fn$;

REVOKE ALL ON FUNCTION public.amanah_save_po_item_unit_price(uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amanah_save_po_item_unit_price(uuid,numeric)
 TO authenticated,service_role;
