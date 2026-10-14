-- AMANAH: receipt-required, irreversible Purchase Order material cost finalization.
-- The uploaded private receipt is verified BEFORE any material cost is posted.
-- No cost or finalization happens if validation fails. Existing receipts and
-- quantities are preserved and only received/paid-priced quantities are charged.
BEGIN;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('amanah-po-receipts','amanah-po-receipts',false,10485760,
 ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.amanah_po_cost_finalizations(
  purchase_order_id uuid PRIMARY KEY REFERENCES public.purchase_orders(purchase_order_id) ON DELETE RESTRICT,
  receipt_path text NOT NULL UNIQUE,
  receipt_filename text NOT NULL,
  finalized_by uuid NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  posted_now numeric(14,2) NOT NULL DEFAULT 0,
  posted_total numeric(14,2) NOT NULL DEFAULT 0,
  posted_lines integer NOT NULL DEFAULT 0,
  received_value_snapshot numeric(14,2) NOT NULL DEFAULT 0,
  remaining_unreceived_quantity numeric NOT NULL DEFAULT 0
);
ALTER TABLE public.amanah_po_cost_finalizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.amanah_po_cost_finalizations FROM PUBLIC,anon;
GRANT SELECT ON public.amanah_po_cost_finalizations TO authenticated;
DROP POLICY IF EXISTS amanah_po_cost_finalizations_read ON public.amanah_po_cost_finalizations;
CREATE POLICY amanah_po_cost_finalizations_read ON public.amanah_po_cost_finalizations
 FOR SELECT TO authenticated USING (
  public.amanah_has_permission('purchasing.view') OR
  public.amanah_has_permission('purchasing.manage') OR
  public.amanah_has_permission('purchasing.approve')
 );

DROP POLICY IF EXISTS amanah_po_receipts_upload ON storage.objects;
CREATE POLICY amanah_po_receipts_upload ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
 bucket_id='amanah-po-receipts'
 AND public.amanah_has_permission('purchasing.manage')
 AND (storage.foldername(name))[2]=auth.uid()::text
 AND EXISTS (
   SELECT 1 FROM public.purchase_orders po
   WHERE po.purchase_order_id::text=(storage.foldername(name))[1]
     AND po.purchase_type='PROJECT MATERIALS'
     AND po.status NOT IN ('CLOSED','CANCELLED')
     AND NOT EXISTS (
      SELECT 1 FROM public.amanah_po_cost_finalizations f WHERE f.purchase_order_id=po.purchase_order_id
     )
 )
);
DROP POLICY IF EXISTS amanah_po_receipts_read ON storage.objects;
CREATE POLICY amanah_po_receipts_read ON storage.objects
FOR SELECT TO authenticated USING(
 bucket_id='amanah-po-receipts'
 AND (public.amanah_has_permission('purchasing.view')
   OR public.amanah_has_permission('purchasing.manage')
   OR public.amanah_has_permission('purchasing.approve'))
);
DROP POLICY IF EXISTS amanah_po_receipts_cleanup ON storage.objects;
CREATE POLICY amanah_po_receipts_cleanup ON storage.objects
FOR DELETE TO authenticated USING(
 bucket_id='amanah-po-receipts'
 AND owner_id=auth.uid()::text
 AND public.amanah_has_permission('purchasing.manage')
 AND NOT EXISTS(
   SELECT 1 FROM public.amanah_po_cost_finalizations f WHERE f.receipt_path=storage.objects.name
 )
);

-- Preserve finalization evidence and entire PO/receiving record against API
-- edits/deletions, including any old clients using direct PostgREST writes.
CREATE OR REPLACE FUNCTION public.amanah_guard_finalized_purchase_order()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $guard$
DECLARE v_id uuid;
BEGIN
 IF TG_TABLE_NAME='purchase_orders' THEN
   v_id:=OLD.purchase_order_id;
 ELSE
   v_id:=OLD.purchase_order_id;
 END IF;
 IF EXISTS(SELECT 1 FROM public.amanah_po_cost_finalizations WHERE purchase_order_id=v_id) THEN
  RAISE EXCEPTION 'This Purchase Order is finalized with receipt evidence. Editing, managing supply, or deleting is disabled.'
   USING ERRCODE='23514';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$guard$;

DROP TRIGGER IF EXISTS trg_amanah_lock_finalized_purchase_order ON public.purchase_orders;
CREATE TRIGGER trg_amanah_lock_finalized_purchase_order
BEFORE UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.amanah_guard_finalized_purchase_order();

DROP TRIGGER IF EXISTS trg_amanah_lock_finalized_purchase_order_items ON public.purchase_order_items;
CREATE TRIGGER trg_amanah_lock_finalized_purchase_order_items
BEFORE UPDATE OR DELETE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.amanah_guard_finalized_purchase_order();

CREATE OR REPLACE FUNCTION public.amanah_finalize_po_received_cost_with_receipt(
 p_purchase_order_id uuid,p_receipt_path text,p_receipt_filename text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $finalize$
DECLARE
 v_po public.purchase_orders%ROWTYPE;
 v_storage record;
 v_result jsonb;
 v_posted_total numeric(14,2);
 v_received_total numeric(14,2);
 v_unreceived numeric;
 v_photo_name text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.amanah_has_permission('purchasing.manage') THEN
  RAISE EXCEPTION 'Only the Purchasing Officer may finalize a Purchase Order'
   USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_po FROM public.purchase_orders
 WHERE purchase_order_id=p_purchase_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase Order not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.amanah_po_cost_finalizations
  WHERE purchase_order_id=p_purchase_order_id) THEN
  RAISE EXCEPTION 'This Purchase Order has already been finalized with receipt evidence.';
 END IF;
 IF v_po.status IN ('CANCELLED','CLOSED') OR v_po.purchase_type<>'PROJECT MATERIALS' THEN
  RAISE EXCEPTION 'Only active Project Materials Purchase Orders may be finalized here.';
 END IF;

 -- The receipt path must point to a real, previously uploaded PRIVATE object
 -- owned by the currently authenticated Purchasing Officer.
 IF p_receipt_path IS NULL OR
    p_receipt_path NOT LIKE p_purchase_order_id::text||'/'||auth.uid()::text||'/%' OR
    nullif(btrim(coalesce(p_receipt_filename,'')),'') IS NULL THEN
  RAISE EXCEPTION 'A receipt photo or PDF attachment is required.';
 END IF;
 SELECT name,owner_id,metadata INTO v_storage
 FROM storage.objects
 WHERE bucket_id='amanah-po-receipts' AND name=p_receipt_path;
 IF NOT FOUND OR v_storage.owner_id IS DISTINCT FROM auth.uid()::text THEN
  RAISE EXCEPTION 'Receipt attachment has not been uploaded by this account.';
 END IF;
 IF (v_storage.metadata->>'mimetype') NOT IN
    ('image/jpeg','image/png','image/webp','application/pdf') OR
    coalesce((v_storage.metadata->>'size')::bigint,0)<=0 THEN
  RAISE EXCEPTION 'Receipt must be an uploaded JPG, PNG, WEBP, or PDF file.';
 END IF;

 -- Existing posting rules lock the PO, exclude unreceived/unpriced items,
 -- and prevent double-counting. This call runs in this same SQL transaction.
 v_result:=public.amanah_post_received_materials_project_cost(p_purchase_order_id);
 SELECT coalesce(sum(post.amount),0) INTO v_posted_total
 FROM public.amanah_po_material_cost_postings post
 JOIN public.purchase_order_items i ON i.purchase_order_item_id=post.purchase_order_item_id
 WHERE i.purchase_order_id=p_purchase_order_id;

 IF v_posted_total<=0 THEN
  RAISE EXCEPTION 'No received and priced materials have been posted. Finalization is not allowed.';
 END IF;
 SELECT coalesce(sum(greatest(i.quantity-i.received_quantity,0)),0),
        coalesce(sum(coalesce(i.received_quantity,0)*coalesce(i.unit_price,0)),0)
 INTO v_unreceived,v_received_total
 FROM public.purchase_order_items i
 WHERE i.purchase_order_id=p_purchase_order_id;
 -- Only order state changes here; the finalization record is inserted last
 -- so the immutable PO/item guards activate immediately afterward.
 UPDATE public.purchase_orders
 SET status='CLOSED',updated_at=now()
 WHERE purchase_order_id=p_purchase_order_id;

 INSERT INTO public.amanah_po_cost_finalizations(
  purchase_order_id,receipt_path,receipt_filename,finalized_by,
  posted_now,posted_total,posted_lines,received_value_snapshot,
  remaining_unreceived_quantity
 ) VALUES(
  p_purchase_order_id,p_receipt_path,left(btrim(p_receipt_filename),180),auth.uid(),
  coalesce((v_result->>'posted_amount')::numeric,0),v_posted_total,
  coalesce((v_result->>'posted_lines')::int,0),v_received_total,v_unreceived
 );
 RETURN jsonb_build_object(
  'po_no',v_po.po_no,'finalized',true,
  'posted_now',coalesce((v_result->>'posted_amount')::numeric,0),
  'posted_total',v_posted_total,
  'receipt_path',p_receipt_path,
  'unreceived_quantity',v_unreceived
 );
END;
$finalize$;

-- Disable older clients from bypassing the compulsory receipt by calling the
-- legacy posting RPC directly. Internal SECURITY DEFINER use remains valid.
REVOKE ALL ON FUNCTION public.amanah_post_received_materials_project_cost(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.amanah_finalize_po_received_cost_with_receipt(uuid,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.amanah_finalize_po_received_cost_with_receipt(uuid,text,text)
 TO authenticated,service_role;

COMMIT;
