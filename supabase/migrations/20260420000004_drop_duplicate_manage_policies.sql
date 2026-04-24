-- CLEANUP: Drop duplicate "manage" ALL policies that shadow the canonical
-- get_my_tenant_ids_array()-based ones.
--
-- Before this migration:
--   categories, menu_items, menus and venues each carried two ALL policies
--   that expressed the same tenant-membership check but with different
--   predicates:
--     - "Admins can manage own tenant X" qual = tenant_id = ANY(get_my_tenant_ids_array())
--     - "Admins can manage their restaurant X" qual = tenant_id IN (SELECT
--       admin_users.tenant_id FROM admin_users WHERE admin_users.user_id =
--       auth.uid())
--   (menus additionally had an unqualified "Admins can manage menus" copy.)
--
--   PERMISSIVE policies are OR'd, so the duplicates never granted extra
--   access, but they forced Postgres to evaluate an inline subquery with
--   admin_users access on every row touch, which also triggered recursive
--   RLS evaluation on admin_users itself. The get_my_tenant_ids_array()
--   helper is SECURITY DEFINER + STABLE, so it is both safer (no recursion)
--   and faster (query plan caches a single uuid[] lookup).
--
-- After this migration only the canonical "Admins can manage own tenant X"
-- policies remain on each table.

DROP POLICY IF EXISTS "Admins can manage their restaurant categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage their restaurant menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Admins can manage menus" ON public.menus;
DROP POLICY IF EXISTS "Admins can manage their restaurant venues" ON public.venues;
