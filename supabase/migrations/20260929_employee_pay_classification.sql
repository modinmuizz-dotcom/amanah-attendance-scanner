-- AMANAH Employee Compensation and Classification
-- Position and department are controlled in the application.
-- Compensation:
--   TRUCKERS -> hourly_rate
--   ADMIN / CONSTRUCTION / MAINTENANCE / PROCUREMENT -> daily_rate
--   Non-truckers rate_basis -> HALF DAY or PER DAY

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS daily_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_basis text NOT NULL DEFAULT 'PER DAY';

UPDATE public.employees
SET
  daily_rate = COALESCE(daily_rate, 0),
  rate_basis = CASE
    WHEN rate_basis IS NULL OR btrim(rate_basis) = '' THEN 'PER DAY'
    WHEN rate_basis IN ('HALF DAY', 'PER DAY') THEN rate_basis
    ELSE 'PER DAY'
  END;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_rate_basis_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_rate_basis_check
  CHECK (rate_basis IN ('HALF DAY', 'PER DAY'));