-- Fix missing SET search_path on SECURITY DEFINER functions
-- Prevents search_path injection attacks (HIGH-04)
-- These functions were not covered by migration 20260402000002_fix_function_search_path.sql

-- claim_coupon_usage: created in 20260309000000_atomic_coupon_claim.sql
ALTER FUNCTION public.claim_coupon_usage(uuid) SET search_path = public;

-- unclaim_coupon_usage: created in 20260310000002_unclaim_coupon_usage.sql
ALTER FUNCTION public.unclaim_coupon_usage(uuid) SET search_path = public;

-- get_owner_dashboard: created in 20260218000001_restaurant_groups.sql
ALTER FUNCTION public.get_owner_dashboard(uuid) SET search_path = public;
