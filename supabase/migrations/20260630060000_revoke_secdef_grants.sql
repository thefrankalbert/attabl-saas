-- Revoke unnecessary EXECUTE grants on SECURITY DEFINER functions.
--
-- Context: Supabase security advisor flagged several SECURITY DEFINER functions
-- as callable by anon/authenticated. Audit (2026-06-30) found:
--   - provision_group_restaurant: trusts the caller-supplied p_user_id instead of
--     auth.uid(). It is only ever invoked server-side via the service_role admin
--     client (src/app/api/restaurants/create/route.ts derives user.id from the
--     session). Revoking anon/authenticated closes the direct-RPC isolation gap
--     without affecting the legitimate flow.
--   - broadcast_order_status / enforce_tenant_name_cross_group_unique /
--     prevent_super_admin_elevation: trigger functions. Triggers fire as the table
--     owner regardless of EXECUTE grants, so anon/authenticated/PUBLIC EXECUTE is
--     pure surface with no purpose.
--
-- service_role keeps EXECUTE in all cases (admin/server flows rely on it).
--
-- Rollback:
--   GRANT EXECUTE ON FUNCTION public.provision_group_restaurant(uuid,uuid,text,text,text,text,text) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.broadcast_order_status() TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.enforce_tenant_name_cross_group_unique() TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.prevent_super_admin_elevation() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.provision_group_restaurant(uuid,uuid,text,text,text,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broadcast_order_status() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_tenant_name_cross_group_unique() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_super_admin_elevation() FROM anon, authenticated, PUBLIC;
