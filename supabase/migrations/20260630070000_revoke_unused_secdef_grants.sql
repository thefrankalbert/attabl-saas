-- Revoke EXECUTE on SECURITY DEFINER functions that need neither anon nor
-- authenticated access. Follow-up to 20260630060000.
--
-- Audit (2026-06-30) of the remaining advisor warnings:
--   - assert_tenant_member: only PERFORMed inside other SECURITY DEFINER
--     functions (which run with the definer/owner privilege), referenced by 0
--     RLS policies, never called directly via .rpc(). authenticated EXECUTE is
--     unnecessary.
--   - get_tenant_public_by_id / increment_menu_item_favorites: not referenced by
--     any RLS policy and never invoked from the app (.rpc grep = 0 hits, only
--     present in generated types). Dead exposure.
--
-- NOT touched (must keep anon/authenticated EXECUTE): get_my_tenant_ids_array
-- (40 RLS policies), get_my_tenant_ids (8 policies), is_super_admin (1 policy).
-- RLS policy expressions calling these run as the querying role and REQUIRE its
-- EXECUTE privilege; revoking would break row-level security across 22 tables.
-- Their advisor warnings (lint 0028/0029) are an accepted false positive for the
-- standard Supabase RLS-helper pattern.
--
-- service_role keeps EXECUTE everywhere.
--
-- Rollback:
--   GRANT EXECUTE ON FUNCTION public.assert_tenant_member(uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.get_tenant_public_by_id(uuid) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.increment_menu_item_favorites(uuid, uuid, integer) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.assert_tenant_member(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_tenant_public_by_id(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_menu_item_favorites(uuid, uuid, integer) FROM anon, authenticated, PUBLIC;
