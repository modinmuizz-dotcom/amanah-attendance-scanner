-- =========================================================
-- AMANAH: SUPPLIER MASTER
-- Migration: 20260928_supplier_master.sql
--
-- Registers suppliers/vendors used by AMANAH Purchasing.
-- The Supplier Master is also linked to Purchase Orders through
-- purchase_orders.supplier_id.
-- =========================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SEQUENCE IF NOT EXISTS public.supplier_no_seq START 1;

CREATE TABLE IF NOT EXISTS public.suppliers (
  supplier_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  supplier_code text NOT NULL UNIQUE DEFAULT (
    'SUP-' || lpad(nextval('public.supplier_no_seq')::text, 4, '0')
  ),

  supplier_name text NOT NULL,

  -- Optional classification for future purchasing controls.
  supplier_type text NOT NULL DEFAULT 'MATERIAL SUPPLIER',

  contact_person text,
  contact_number text,
  email text,

  address text,
  tin text,

  payment_terms text,
  delivery_terms text,

  status text NOT NULL DEFAULT 'ACTIVE',
  notes text,

  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT suppliers_type_check
    CHECK (
      supplier_type IN (
        'MATERIAL SUPPLIER',
        'EQUIPMENT SUPPLIER',
        'SERVICE SUPPLIER',
        'GENERAL SUPPLIER'
      )
    ),

  CONSTRAINT suppliers_status_check
    CHECK (
      status IN ('ACTIVE','INACTIVE')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_name_unique
  ON public.suppliers (lower(trim(supplier_name)));

CREATE INDEX IF NOT EXISTS idx_suppliers_name
  ON public.suppliers (supplier_name);

CREATE INDEX IF NOT EXISTS idx_suppliers_status
  ON public.suppliers (status);

CREATE INDEX IF NOT EXISTS idx_suppliers_code
  ON public.suppliers (supplier_code);

-- =========================================================
-- LINK PURCHASE ORDERS TO REGISTERED SUPPLIERS
-- =========================================================

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS supplier_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_orders_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_supplier_id_fkey
      FOREIGN KEY (supplier_id)
      REFERENCES public.suppliers(supplier_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier
  ON public.purchase_orders(supplier_id);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE public.suppliers
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_authenticated_select
  ON public.suppliers;

CREATE POLICY suppliers_authenticated_select
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS suppliers_authenticated_insert
  ON public.suppliers;

CREATE POLICY suppliers_authenticated_insert
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS suppliers_authenticated_update
  ON public.suppliers;

CREATE POLICY suppliers_authenticated_update
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS suppliers_authenticated_delete
  ON public.suppliers;

CREATE POLICY suppliers_authenticated_delete
  ON public.suppliers
  FOR DELETE
  TO authenticated
  USING (true);

-- =========================================================
-- COMMENTS
-- =========================================================

COMMENT ON TABLE public.suppliers IS
'AMANAH Supplier Master for purchasing and supplier registration.';

COMMENT ON COLUMN public.suppliers.supplier_code IS
'Unique AMANAH supplier/vendor code.';

COMMENT ON COLUMN public.suppliers.supplier_name IS
'Registered supplier/vendor business name.';

COMMENT ON COLUMN public.purchase_orders.supplier_id IS
'Registered AMANAH supplier selected for this purchase order.';

COMMIT;
