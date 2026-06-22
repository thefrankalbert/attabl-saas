-- Security-definer function exposure hardening (Supabase advisor:
-- anon/authenticated_security_definer_function_executable).
--
-- SECURITY DEFINER functions bypass RLS. By default Postgres grants EXECUTE to
-- PUBLIC, so anon + authenticated could call sensitive functions directly via
-- the data API (e.g. anon calling delete_admin_user_atomic or get_daily_revenue
-- for any tenant). This migration removes the blanket PUBLIC grant and re-grants
-- EXECUTE only to the role(s) that legitimately call each function (verified
-- against the app's actual callers + their Supabase client).
--
-- IMPORTANT: REVOKE ... FROM anon alone would NOT work while EXECUTE is granted
-- to PUBLIC (anon inherits it). We REVOKE FROM PUBLIC and then GRANT back
-- explicitly. service_role is re-granted on every function below because the
-- order/signup/cron/admin flows use the service_role admin client and would
-- break otherwise.
--
-- NOT touched (must stay callable by anon/authenticated, intentionally):
--   RLS helpers used inside policies: get_my_tenant_ids, get_my_tenant_ids_array,
--     is_super_admin, prevent_super_admin_elevation (revoking breaks ALL RLS).
--   Public storefront: get_tenant_by_slug, get_tenant_public_by_id.
--   Convive (anonymous) storefront: get_co_ordered_items, increment_menu_item_favorites.
--   reset_tenant_data: already not granted to anon/authenticated.
--
-- Rollback: GRANT EXECUTE ON FUNCTION <fn> TO PUBLIC; for each function below.

-- ============================================================================
-- A. service_role ONLY (callers use the createAdminClient / service_role):
--    delete_admin_user_atomic, destock_order, provision_signup_tenant,
--    expire_stale_payment_sessions. anon + authenticated fully removed.
-- ============================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.delete_admin_user_atomic(uuid, uuid)',
    'public.destock_order(uuid, uuid)',
    'public.provision_signup_tenant(text, text, text, uuid, text, text, text)',
    'public.expire_stale_payment_sessions(integer)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- ============================================================================
-- B. authenticated + service_role (app calls these as the authenticated admin
--    via the client/server session, and/or via service_role in the order flow);
--    anon removed. NOTE: these still lack an internal tenant-ownership check, so
--    a logged-in user could pass another tenant's id - that cross-tenant guard is
--    a tracked follow-up (requires editing the function bodies); removing anon is
--    the safe first step.
-- ============================================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_daily_revenue(uuid, timestamptz, timestamptz)',
    'public.get_order_summary(uuid, timestamptz, timestamptz)',
    'public.get_top_items(uuid, timestamptz, timestamptz, integer)',
    'public.get_stock_status(uuid)',
    'public.get_owner_dashboard(uuid)',
    'public.adjust_ingredient_stock(uuid, uuid, numeric)',
    'public.set_opening_stock(uuid, uuid, numeric)',
    'public.increment_login_count(uuid)',
    'public.claim_coupon_usage(uuid)',
    'public.unclaim_coupon_usage(uuid)',
    'public.increment_coupon_usage(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;
