-- AMANAH Purchase Order transaction-safe editor.
-- Existing PO lines are updated in place; supplier status and receiving history
-- are preserved. line_total is a STORED GENERATED column and MUST NOT be written.
-- An invalid line rolls back the entire change, including the PO header.
CREATE OR REPLACE FUNCTION public.amanah_save_purchase_order_details(
  p_purchase_order_id uuid,
  p_header jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_row jsonb;
  v_item public.purchase_order_items%ROWTYPE;
  v_item_id uuid;
  v_item_count integer;
  v_input_count integer;
  v_changed integer;
  v_quantity numeric;
  v_price numeric;
  v_subtotal numeric(14,2);
  v_date date;
  v_delivery date;
BEGIN
  IF auth.uid() IS NULL OR NOT public.amanah_has_permission('purchasing.manage') THEN
    RAISE EXCEPTION 'Only an authorized Purchasing Officer may edit Purchase Orders'
      USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_header)<>'object' OR jsonb_typeof(p_items)<>'array' THEN
    RAISE EXCEPTION 'Invalid Purchase Order details';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders
   WHERE purchase_order_id=p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase Order not found'; END IF;
  IF v_po.status IN ('RECEIVED','CLOSED','CANCELLED') THEN
    RAISE EXCEPTION 'This Purchase Order is locked for editing (status %)',v_po.status;
  END IF;

  SELECT * INTO v_supplier FROM public.suppliers
   WHERE supplier_id=NULLIF(btrim(p_header->>'supplier_id'),'')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a registered supplier'; END IF;
  v_date:=NULLIF(p_header->>'po_date','')::date;
  v_delivery:=NULLIF(p_header->>'expected_delivery_date','')::date;
  IF v_date IS NULL OR (v_delivery IS NOT NULL AND v_delivery<v_date) THEN
    RAISE EXCEPTION 'Invalid Purchase Order date or expected delivery date';
  END IF;

  SELECT count(*) INTO v_item_count FROM public.purchase_order_items
   WHERE purchase_order_id=p_purchase_order_id;
  v_input_count:=jsonb_array_length(p_items);
  IF v_input_count=0 OR v_input_count<>v_item_count OR v_item_count>500 THEN
    RAISE EXCEPTION 'Purchase Order line count changed. Refresh and retry.';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_item_id:=NULLIF(v_row->>'purchase_order_item_id','')::uuid;
    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'Order item identity is missing. Refresh and retry.';
    END IF;

    SELECT * INTO v_item FROM public.purchase_order_items
     WHERE purchase_order_id=p_purchase_order_id
       AND purchase_order_item_id=v_item_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order item does not belong to this Purchase Order';
    END IF;

    v_quantity:=NULLIF(v_row->>'quantity','')::numeric;
    v_price:=NULLIF(v_row->>'unit_price','')::numeric;
    IF v_quantity IS NULL OR v_quantity<=0 OR v_quantity>99999999999 OR
       (v_price IS NOT NULL AND (v_price<0 OR v_price>99999999999)) THEN
      RAISE EXCEPTION 'Invalid quantity or unit price for %',v_item.material_name;
    END IF;
    IF v_quantity < greatest(coalesce(v_item.confirmed_quantity,0),
                             coalesce(v_item.received_quantity,0)) THEN
      RAISE EXCEPTION 'Quantity cannot be less than confirmed/received quantity for %',
        v_item.material_name;
    END IF;
    IF NULLIF(btrim(v_row->>'material_name'),'') IS NULL OR
       NULLIF(btrim(v_row->>'unit'),'') IS NULL THEN
      RAISE EXCEPTION 'Material name and unit are required';
    END IF;
    -- Editing a PO is not allowed to change line identity or supplier confirmations.
    -- PostgreSQL recalculates generated line_total automatically.
    UPDATE public.purchase_order_items SET
      line_no=COALESCE((v_row->>'line_no')::integer,v_item.line_no),
      material_name=btrim(v_row->>'material_name'),
      specifications=NULLIF(btrim(coalesce(v_row->>'specifications','')),''),
      quantity=v_quantity,unit=btrim(v_row->>'unit'),unit_price=v_price
    WHERE purchase_order_id=p_purchase_order_id
      AND purchase_order_item_id=v_item_id;
    GET DIAGNOSTICS v_changed=ROW_COUNT;
    IF v_changed<>1 THEN RAISE EXCEPTION 'Failed to save PO item %',v_item_id; END IF;
  END LOOP;

  -- The unique line_no constraint catches duplicate/missing line numbers.
  SELECT coalesce(round(sum(coalesce(line_total,0)),2),0)::numeric(14,2)
    INTO v_subtotal FROM public.purchase_order_items
    WHERE purchase_order_id=p_purchase_order_id;

  UPDATE public.purchase_orders SET
    supplier_id=v_supplier.supplier_id,
    supplier_name=v_supplier.supplier_name,
    supplier_contact=NULLIF(btrim(coalesce(p_header->>'supplier_contact','')),''),
    supplier_address=NULLIF(btrim(coalesce(p_header->>'supplier_address','')),''),
    po_date=v_date,
    expected_delivery_date=v_delivery,
    payment_terms=NULLIF(btrim(coalesce(p_header->>'payment_terms','')),''),
    delivery_terms=NULLIF(btrim(coalesce(p_header->>'delivery_terms','')),''),
    remarks=NULLIF(btrim(coalesce(p_header->>'remarks','')),''),
    subtotal=v_subtotal,
    grand_total=v_subtotal+coalesce(v_po.tax_amount,0)+coalesce(v_po.other_charges,0),
    updated_at=now()
  WHERE purchase_order_id=p_purchase_order_id;

  PERFORM public.amanah_refresh_purchase_order_status(p_purchase_order_id);
  IF v_po.purchase_request_id IS NOT NULL THEN
    PERFORM public.amanah_refresh_purchase_request_status(v_po.purchase_request_id);
  END IF;

  RETURN jsonb_build_object('purchase_order_id',p_purchase_order_id,
    'po_no',v_po.po_no,'subtotal',v_subtotal,
    'grand_total',v_subtotal+coalesce(v_po.tax_amount,0)+coalesce(v_po.other_charges,0),
    'saved_items',v_item_count);
END;
$body$;

REVOKE ALL ON FUNCTION public.amanah_save_purchase_order_details(uuid,jsonb,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amanah_save_purchase_order_details(uuid,jsonb,jsonb)
  TO authenticated,service_role;
