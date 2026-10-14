-- Seal every write path to a finalized PO, including newly inserted lines
-- and pickup records. Update/delete protections were installed earlier.
BEGIN;
CREATE OR REPLACE FUNCTION public.amanah_guard_finalized_purchase_order()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $guard$
DECLARE v_id uuid;
BEGIN
  v_id:=CASE WHEN TG_OP='INSERT' THEN NEW.purchase_order_id ELSE OLD.purchase_order_id END;
  IF EXISTS(SELECT 1 FROM public.amanah_po_cost_finalizations WHERE purchase_order_id=v_id) THEN
    RAISE EXCEPTION
      'This Purchase Order is finalized with receipt evidence. Editing, deleting, adding materials, receiving, or managing pickup is disabled.'
    USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$guard$;
DROP TRIGGER IF EXISTS trg_amanah_lock_finalized_purchase_order_items ON public.purchase_order_items;
CREATE TRIGGER trg_amanah_lock_finalized_purchase_order_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.amanah_guard_finalized_purchase_order();
DROP TRIGGER IF EXISTS trg_amanah_lock_finalized_pickup_requests ON public.material_pickup_requests;
CREATE TRIGGER trg_amanah_lock_finalized_pickup_requests
  BEFORE INSERT OR UPDATE OR DELETE ON public.material_pickup_requests
  FOR EACH ROW EXECUTE FUNCTION public.amanah_guard_finalized_purchase_order();
COMMIT;