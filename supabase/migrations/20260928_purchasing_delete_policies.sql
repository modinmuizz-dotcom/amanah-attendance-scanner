-- =========================================================
-- AMANAH: PURCHASING DELETE POLICIES
-- Migration: 20260928_purchasing_delete_policies.sql
-- =========================================================

BEGIN;

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_requests_authenticated_delete
  ON public.purchase_requests;

CREATE POLICY purchase_requests_authenticated_delete
  ON public.purchase_requests
  FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS purchase_orders_authenticated_delete
  ON public.purchase_orders;

CREATE POLICY purchase_orders_authenticated_delete
  ON public.purchase_orders
  FOR DELETE
  TO authenticated
  USING (true);

COMMIT;
