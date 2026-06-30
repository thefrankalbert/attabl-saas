-- C3 (Phase 3) - decouple fulfillment from payment.
--
-- Before: paying an order forced orders.status='delivered' (markPaid + the payment
-- ledger recompute), so "served but unpaid" and "paid but unserved" were impossible to
-- represent, and a paid-but-unprepared order wrongly dropped off the KDS board.
--
-- This migration adds orders.served_at; the code change stops the payment paths from
-- touching orders.status (fulfillment axis stays driven by the KDS/POS fulfillment
-- actions), and stamps served_at when an order reaches the terminal fulfillment state
-- 'delivered'. payment_status (ledger-derived) becomes the sole payment axis.
--
-- Additive + backfill only. No status rename, no CHECK change.
-- Rollback: ALTER TABLE public.orders DROP COLUMN IF EXISTS served_at;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS served_at timestamptz;

-- Backfill historical fulfilled orders so served_at is meaningful for past data.
UPDATE public.orders
SET served_at = updated_at
WHERE status = 'delivered' AND served_at IS NULL;
