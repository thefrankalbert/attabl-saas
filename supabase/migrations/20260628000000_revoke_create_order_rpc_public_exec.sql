-- Security hardening: lock down create_order_with_items RPC EXECUTE grants.
--
-- Finding (security/AUDIT-EXECUTION-REPORT.md, 4.1):
-- create_order_with_items is SECURITY INVOKER and was never granted/revoked,
-- so Postgres' default leaves EXECUTE on PUBLIC. The function inserts
-- order_items with price_at_order taken verbatim from the JSON payload
-- (COALESCE((v_item->>'price_at_order')::numeric, 0)) WITHOUT revalidating
-- against menu_items. A client calling /rest/v1/rpc/create_order_with_items
-- directly (anon or authenticated) could therefore submit an arbitrary
-- price_at_order and underpay.
--
-- The only legitimate caller is the server: src/app/api/orders/route.ts builds
-- the order service with createAdminClient() (service_role) AFTER the
-- server-side price check in order.service.ts. Removing PUBLIC/anon/authenticated
-- EXECUTE does NOT break the deployed app (service_role keeps EXECUTE) and it
-- closes the direct-RPC bypass.
--
-- Additive + access-tightening only. Safe to apply after the current code is
-- live (it already routes through service_role). No data change.
--
-- Rollback:
--   GRANT EXECUTE ON FUNCTION public.create_order_with_items(
--     uuid, text, numeric, text, text, text, text, text, text, text,
--     numeric, numeric, numeric, numeric, numeric, uuid, uuid, text, text, jsonb
--   ) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, text, numeric, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric, uuid, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order_with_items(
  uuid, text, numeric, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric, uuid, uuid, text, text, jsonb
) TO service_role;
