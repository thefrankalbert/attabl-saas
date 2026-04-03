-- Fix function_search_path_mutable Supabase linter warnings
-- Sets search_path = public on all functions to prevent search_path hijacking attacks
-- See: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

ALTER FUNCTION public.adjust_ingredient_stock(uuid, uuid, numeric) SET search_path = public;
ALTER FUNCTION public.auto_create_user_preferences() SET search_path = public;
ALTER FUNCTION public.delete_admin_user_atomic(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.destock_order(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.generate_menu_slug(uuid, text) SET search_path = public;
ALTER FUNCTION public.get_daily_revenue(uuid, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.get_order_summary(uuid, timestamptz, timestamptz) SET search_path = public;
ALTER FUNCTION public.get_stock_status(uuid) SET search_path = public;
ALTER FUNCTION public.get_top_items(uuid, timestamptz, timestamptz, integer) SET search_path = public;
ALTER FUNCTION public.increment_coupon_usage(uuid) SET search_path = public;
ALTER FUNCTION public.increment_login_count(uuid) SET search_path = public;
ALTER FUNCTION public.next_order_number(uuid) SET search_path = public;
ALTER FUNCTION public.set_opening_stock(uuid, uuid, numeric) SET search_path = public;
ALTER FUNCTION public.update_ingredients_updated_at() SET search_path = public;
ALTER FUNCTION public.update_menus_updated_at() SET search_path = public;
ALTER FUNCTION public.update_suppliers_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.update_user_preferences_updated_at() SET search_path = public;
