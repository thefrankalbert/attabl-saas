-- 20260703180000_ingredient_purchase_unit_conversion.sql  (ADDITIVE ONLY)
-- Chantier #15 unit conversion. Two new columns on the RLS-protected ingredients
-- table. No new RPC on purpose: the purchase->base conversion is a pure TS helper,
-- so stock_movements keeps its "always base unit" invariant and the reconcilable
-- ledger (adjust_ingredient_stock_tx) is untouched. Existing rows get the safe
-- default units_per_purchase=1 (identity conversion).
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT,
  ADD COLUMN IF NOT EXISTS units_per_purchase NUMERIC(10,3) NOT NULL DEFAULT 1;

ALTER TABLE public.ingredients
  DROP CONSTRAINT IF EXISTS ingredients_units_per_purchase_positive;
ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_units_per_purchase_positive
  CHECK (units_per_purchase > 0);

COMMENT ON COLUMN public.ingredients.purchase_unit IS
  'Optional purchasing-unit label (casier, sac, carton). NULL = purchased in base unit.';
COMMENT ON COLUMN public.ingredients.units_per_purchase IS
  'Base units (ingredients.unit) contained in one purchase_unit. Default 1.';
