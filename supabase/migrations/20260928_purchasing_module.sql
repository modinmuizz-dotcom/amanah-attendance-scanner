-- =========================================================
-- AMANAH: PURCHASING MODULE
-- Migration: 20260928_purchasing_module.sql
--
-- Purchase Request (Site Engineer -> Purchasing)
-- Purchase Order (Purchasing -> Supplier)
-- =========================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS public.purchase_request_no_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_no_seq START 1;

CREATE TABLE IF NOT EXISTS public.purchase_requests (
  purchase_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no text NOT NULL UNIQUE DEFAULT (
    'PR-' || to_char(current_date,'YYYY') || '-' ||
    lpad(nextval('public.purchase_request_no_seq')::text, 4, '0')
  ),

  project_id text NOT NULL,
  project_name text NOT NULL,
  project_location text,

  requester_employee_id text NOT NULL,
  requester_name text NOT NULL,
  requester_position text,
  requester_role text NOT NULL DEFAULT 'SITE ENGINEER',

  request_date date NOT NULL DEFAULT current_date,
  needed_by_date date,
  priority text NOT NULL DEFAULT 'NORMAL',

  purpose text,
  remarks text,

  status text NOT NULL DEFAULT 'DRAFT',

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  review_remarks text,

  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT purchase_requests_priority_check
    CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),

  CONSTRAINT purchase_requests_status_check
    CHECK (status IN (
      'DRAFT',
      'SUBMITTED',
      'UNDER REVIEW',
      'APPROVED',
      'REJECTED',
      'PARTIALLY ORDERED',
      'ORDERED',
      'CANCELLED',
      'CLOSED'
    )),

  CONSTRAINT purchase_requests_needed_date_check
    CHECK (needed_by_date IS NULL OR needed_by_date >= request_date)
);

CREATE TABLE IF NOT EXISTS public.purchase_request_items (
  purchase_request_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES public.purchase_requests(purchase_request_id) ON DELETE CASCADE,

  line_no integer NOT NULL,
  material_id text,
  material_name text NOT NULL,
  specifications text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit text NOT NULL,

  estimated_unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  estimated_total numeric(14,2) GENERATED ALWAYS AS (quantity * estimated_unit_cost) STORED,

  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT purchase_request_items_qty_check CHECK (quantity > 0),
  CONSTRAINT purchase_request_items_cost_check CHECK (estimated_unit_cost >= 0),
  CONSTRAINT purchase_request_items_line_unique UNIQUE (purchase_request_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  purchase_order_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no text NOT NULL UNIQUE DEFAULT (
    'PO-' || to_char(current_date,'YYYY') || '-' ||
    lpad(nextval('public.purchase_order_no_seq')::text, 4, '0')
  ),

  purchase_request_id uuid REFERENCES public.purchase_requests(purchase_request_id) ON DELETE SET NULL,
  purchase_request_no text,

  project_id text NOT NULL,
  project_name text NOT NULL,
  project_location text,

  requester_employee_id text,
  requester_name text,

  supplier_name text NOT NULL,
  supplier_contact text,
  supplier_address text,

  po_date date NOT NULL DEFAULT current_date,
  expected_delivery_date date,

  status text NOT NULL DEFAULT 'DRAFT',

  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  other_charges numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,

  payment_terms text,
  delivery_terms text,
  remarks text,

  approved_by text,
  approved_at timestamptz,

  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT purchase_orders_status_check
    CHECK (status IN (
      'DRAFT',
      'APPROVED',
      'SENT TO SUPPLIER',
      'PARTIALLY RECEIVED',
      'RECEIVED',
      'CANCELLED',
      'CLOSED'
    )),

  CONSTRAINT purchase_orders_amounts_check
    CHECK (
      subtotal >= 0 AND
      tax_amount >= 0 AND
      other_charges >= 0 AND
      grand_total >= 0
    ),

  CONSTRAINT purchase_orders_delivery_date_check
    CHECK (
      expected_delivery_date IS NULL
      OR expected_delivery_date >= po_date
    )
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  purchase_order_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(purchase_order_id) ON DELETE CASCADE,

  line_no integer NOT NULL,
  purchase_request_item_id uuid REFERENCES public.purchase_request_items(purchase_request_item_id) ON DELETE SET NULL,

  material_id text,
  material_name text NOT NULL,
  specifications text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit text NOT NULL,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,

  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT purchase_order_items_qty_check CHECK (quantity > 0),
  CONSTRAINT purchase_order_items_price_check CHECK (unit_price >= 0),
  CONSTRAINT purchase_order_items_line_unique UNIQUE (purchase_order_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_project
  ON public.purchase_requests(project_id);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_requester
  ON public.purchase_requests(requester_employee_id);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_status
  ON public.purchase_requests(status);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_request_date
  ON public.purchase_requests(request_date);

CREATE INDEX IF NOT EXISTS idx_purchase_request_items_request
  ON public.purchase_request_items(purchase_request_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_project
  ON public.purchase_orders(project_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_request
  ON public.purchase_orders(purchase_request_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
  ON public.purchase_orders(status);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po
  ON public.purchase_order_items(purchase_order_id);

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_requests_authenticated_select ON public.purchase_requests;
CREATE POLICY purchase_requests_authenticated_select
  ON public.purchase_requests FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS purchase_requests_authenticated_insert ON public.purchase_requests;
CREATE POLICY purchase_requests_authenticated_insert
  ON public.purchase_requests FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS purchase_requests_authenticated_update ON public.purchase_requests;
CREATE POLICY purchase_requests_authenticated_update
  ON public.purchase_requests FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS purchase_request_items_authenticated_select ON public.purchase_request_items;
CREATE POLICY purchase_request_items_authenticated_select
  ON public.purchase_request_items FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS purchase_request_items_authenticated_insert ON public.purchase_request_items;
CREATE POLICY purchase_request_items_authenticated_insert
  ON public.purchase_request_items FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS purchase_request_items_authenticated_update ON public.purchase_request_items;
CREATE POLICY purchase_request_items_authenticated_update
  ON public.purchase_request_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS purchase_request_items_authenticated_delete ON public.purchase_request_items;
CREATE POLICY purchase_request_items_authenticated_delete
  ON public.purchase_request_items FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS purchase_orders_authenticated_select ON public.purchase_orders;
CREATE POLICY purchase_orders_authenticated_select
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS purchase_orders_authenticated_insert ON public.purchase_orders;
CREATE POLICY purchase_orders_authenticated_insert
  ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS purchase_orders_authenticated_update ON public.purchase_orders;
CREATE POLICY purchase_orders_authenticated_update
  ON public.purchase_orders FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS purchase_order_items_authenticated_select ON public.purchase_order_items;
CREATE POLICY purchase_order_items_authenticated_select
  ON public.purchase_order_items FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS purchase_order_items_authenticated_insert ON public.purchase_order_items;
CREATE POLICY purchase_order_items_authenticated_insert
  ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS purchase_order_items_authenticated_update ON public.purchase_order_items;
CREATE POLICY purchase_order_items_authenticated_update
  ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS purchase_order_items_authenticated_delete ON public.purchase_order_items;
CREATE POLICY purchase_order_items_authenticated_delete
  ON public.purchase_order_items FOR DELETE TO authenticated
  USING (true);

COMMENT ON TABLE public.purchase_requests IS
'AMANAH Purchase Request raised by a project/site engineer and sent to Purchasing.';

COMMENT ON TABLE public.purchase_request_items IS
'Line items requested for a specific project purchase request.';

COMMENT ON TABLE public.purchase_orders IS
'AMANAH Purchase Order created by Purchasing against a purchase request and issued to a supplier.';

COMMENT ON TABLE public.purchase_order_items IS
'Line items included in a purchase order.';

COMMIT;
