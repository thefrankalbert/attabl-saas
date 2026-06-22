-- QA hardening (BUG-015): close two RLS coverage gaps.
--
-- 1. restaurant_groups had SELECT / INSERT / UPDATE owner policies plus a
--    service_role FOR ALL, but NO permissive DELETE policy for the authenticated
--    owner. RLS is deny-by-default, so an owner literally could not delete their
--    own group. Add a DELETE policy mirroring the existing owner SELECT/UPDATE
--    (the table is scoped by owner_user_id, not tenant_id).
--
-- 2. Many permissive FOR ALL "admins/owner/service manage" policies were created
--    with a USING clause but NO explicit WITH CHECK. Postgres falls back to USING
--    for the write-check when WITH CHECK is omitted, so this was not an open hole,
--    but .claude/rules/01-security.md requires an explicit WITH CHECK on every
--    INSERT/UPDATE-capable policy (defense-in-depth + clarity). This migration
--    mirrors each such policy's USING expression into an explicit WITH CHECK.
--
-- Approach for (2): an in-place, idempotent DO loop instead of DROP+CREATE, so
-- there is never a window where a live production policy does not exist. It
-- copies qual -> with_check for every PERMISSIVE FOR ALL policy that currently
-- lacks a WITH CHECK, and is a no-op on re-run (with_check IS NULL guard). It
-- deliberately skips RESTRICTIVE deny-all policies (wave_events /
-- orange_money_events service-only, USING (false)) - those already block writes
-- and must not be widened.
--
-- Policies hardened by the loop (verified live via pg_policies before authoring):
--   tenant-scoped (tenant_id = ANY get_my_tenant_ids_array() | IN get_my_tenant_ids()):
--     admin_users, announcements, categories, coupons (x2), ingredients,
--     item_modifiers, item_price_variants, item_suggestions, menus, orders,
--     recipes, stock_movements, suppliers, tables, venues, zones
--   admin_users-subquery scoped: dish_photo_drafts, role_permissions
--     (owner_can_manage), settings
--   service_role scoped (auth.role() = 'service_role'):
--     invitations, restaurant_groups, role_permissions (service_role)
--
-- Rollback: (1) DROP POLICY "owner_can_delete_own_group" ON restaurant_groups;
--           (2) ALTER POLICY ... WITH CHECK was additive - no functional rollback
--               needed (the USING fallback was already enforcing the same predicate).

-- ============================================================================
-- 1. restaurant_groups - missing owner DELETE policy (functional bug)
-- ============================================================================
DROP POLICY IF EXISTS "owner_can_delete_own_group" ON "public"."restaurant_groups";
CREATE POLICY "owner_can_delete_own_group"
  ON "public"."restaurant_groups"
  FOR DELETE TO "authenticated"
  USING ("owner_user_id" = "auth"."uid"());

-- ============================================================================
-- 2. Explicit WITH CHECK on permissive FOR ALL policies (mirror USING)
-- ============================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'ALL'
      AND permissive = 'PERMISSIVE'
      AND with_check IS NULL
      AND qual IS NOT NULL
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I WITH CHECK (%s)',
      r.policyname, r.tablename, r.qual
    );
  END LOOP;
END $$;
