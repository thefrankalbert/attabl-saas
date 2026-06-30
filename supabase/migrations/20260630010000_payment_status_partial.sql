-- Add 'partial' to orders.payment_status (audit findings H2 + H8, Phase 3).
--
-- Split/partial tenders now accumulate in the append-only payments ledger. When
-- the net settled amount is greater than zero but still below the amount due, the
-- order sits in a new 'partial' state. The previous CHECK only allowed
-- ('pending','paid','refunded'), so a partial settlement could not be persisted.
-- This widens the constraint to ('pending','paid','partial','refunded').
--
-- Additive only: no value is removed, no row is touched. Existing orders keep
-- their current payment_status. The original constraint was defined in
-- 20260210000000_production_upgrade.sql.
--
-- APPLY TO PROD BACKUP-FIRST.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'partial', 'refunded'));
