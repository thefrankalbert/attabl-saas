-- Restore service_role-only EXECUTE on create_order_with_items.
--
-- 20260630020000_money_bigint_transactional DROPs the old numeric-param
-- create_order_with_items and CREATEs the BIGINT-param version. DROP+CREATE resets
-- the function's EXECUTE grants to the PostgreSQL default (EXECUTE TO PUBLIC),
-- which silently UNDID the anon/PUBLIC revoke hardening from
-- 20260628000000_revoke_create_order_rpc_public_exec and
-- 20260629000300_revoke_anon_order_dml_coupon_exec. The order-creation RPC must
-- never be callable by anon/PUBLIC (price-fraud / enumeration surface); the QR and
-- POS routes call it as service_role. This re-revokes and re-grants.
--
-- Applied to prod 2026-06-30 right after the bigint migration (verified grants =
-- {postgres, service_role} only). Committed so the migration chain matches prod.

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, text, bigint, text, text, text, text, text, text, text,
  bigint, bigint, bigint, bigint, bigint, uuid, uuid, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, text, bigint, text, text, text, text, text, text, text,
  bigint, bigint, bigint, bigint, bigint, uuid, uuid, text, text, jsonb, uuid
) TO service_role;
