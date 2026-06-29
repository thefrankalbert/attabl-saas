-- Fire/hold for KDS coursing (audit: KDS reel).
--
-- A course can be HELD (not sent to the kitchen yet, e.g. desserts) and FIRED on
-- demand. Adds order_items.held (default false = active/fired, backward
-- compatible: existing + new items are fired) and fired_at (audit of when an item
-- was fired). The KDS shows held items in a distinct state with a Fire button per
-- course; held items are not counted as active-to-cook.
--
-- No RPC change: create_order_with_items doesn't set `held`, so new items take the
-- default (false) and behave exactly as today. APPLY TO PROD BACKUP-FIRST.
-- Additive (new nullable/defaulted columns), nothing removed.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS held boolean NOT NULL DEFAULT false;
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS fired_at timestamptz;
