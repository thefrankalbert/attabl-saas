-- Defense-in-depth: remove anon write capability on financial tables/functions
-- (audit finding H9).
--
-- anon held table-level INSERT/UPDATE/DELETE on orders and order_items. RLS
-- currently blocks anon writes (the permissive INSERT policies were dropped), so
-- the only thing standing between anon and a direct write is the ABSENCE of a
-- permissive policy - one accidental `CREATE POLICY ... TO anon USING(true)` would
-- re-open direct anon writes that bypass server-side price validation. The real
-- order path runs as service_role (createAdminClient), so anon never needs these
-- grants. Same for the coupon-usage mutation functions: they are SECURITY DEFINER
-- (RLS-bypassing) and were EXECUTE-able by anon, letting an unauthenticated caller
-- burn/manipulate a coupon's usage counter; the order route claims coupons as
-- service_role, so anon EXECUTE is unnecessary.
--
-- Column-level SELECT grants (order tracking) are intentionally LEFT in place -
-- this migration only removes write/exec, never read. Backward-compatible.
--
-- APPLY TO PROD BACKUP-FIRST. This REMOVES access (anon DML/exec) - per the
-- migration-deploy-ordering rule it is safe because the code paths that matter
-- (order creation, coupon claim) already run as service_role, not anon.

-- 1. Orders + order_items: drop anon write capability (keep column SELECTs).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.orders FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.order_items FROM anon;

-- 2. Coupon-usage mutation functions: anon must not execute money-adjacent,
--    RLS-bypassing DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.claim_coupon_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.unclaim_coupon_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) FROM anon;
