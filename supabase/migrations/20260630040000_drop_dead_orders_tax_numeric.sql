-- Drop the dead `orders.tax` numeric column.
--
-- The money-bigint refonte (20260630020000) introduced `orders.tax_amount` (bigint,
-- minor units) as the live tax field. The old `orders.tax` numeric(NOT NULL default 0)
-- column was left behind, orphaned: no view, no order/revenue/payment function, no
-- generated column references it; the application only uses the i18n label key t('tax'),
-- and create_order_with_items does not write it. All 106 prod orders have tax = 0, so
-- there is no data to preserve.
--
-- Rollback (recreate if ever needed):
--   ALTER TABLE public.orders ADD COLUMN tax numeric NOT NULL DEFAULT 0;

ALTER TABLE public.orders DROP COLUMN IF EXISTS tax;
