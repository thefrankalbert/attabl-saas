-- CRITICAL SECURITY FIX: Prevent tenant admins from self-upgrading their plan
-- or tampering with Stripe identifiers and plan limits.
--
-- Before this migration:
--   The PERMISSIVE policy "Admins can update own tenant" lets any admin
--   UPDATE their tenants row (filtered by tenant_id in their admin_users).
--   The policy does not constrain which columns can change. Columns like
--   subscription_plan, subscription_status, stripe_customer_id,
--   stripe_subscription_id, and max_admins / max_venues / max_menu_items
--   are therefore writable from the authenticated client, which means any
--   tenant admin can upgrade their own plan to Premium without paying,
--   raise their entitlement limits, or rewrite their Stripe linkage.
--
-- After this migration:
--   The table-level UPDATE grant on public.tenants is revoked from anon
--   and authenticated. We re-grant UPDATE only on the columns admins are
--   expected to manage from the dashboard (branding, contact, taxes,
--   opening hours, onboarding flags, etc.). Everything related to
--   billing, entitlements, subscription status, and identity stays
--   restricted to service_role, which is the path used by the Stripe
--   webhook in src/app/api/webhooks/stripe/route.ts.
--
--   Columns kept writable by authenticated admins:
--     slug, name, logo_url, primary_color, secondary_color, description,
--     establishment_type, address, city, country, phone, table_count,
--     notification_sound_id, currency, tax_rate, service_charge_rate,
--     enable_tax, enable_service_charge, idle_timeout_minutes,
--     screen_lock_mode, default_locale, supported_currencies,
--     enable_coupons, bar_display_enabled, opening_hours,
--     onboarding_completed, onboarding_completed_at, updated_at
--
--   Columns now only writable by service_role:
--     subscription_plan, subscription_status,
--     subscription_current_period_start, subscription_current_period_end,
--     stripe_customer_id, stripe_subscription_id, trial_ends_at,
--     billing_interval, max_admins, max_venues, max_menu_items,
--     is_active, id, created_at
--
-- The existing RLS policy "Admins can update own tenant" continues to
-- scope updates to the admin's own tenants; this migration only narrows
-- the set of columns each role may target.

REVOKE UPDATE ON public.tenants FROM authenticated;
REVOKE UPDATE ON public.tenants FROM anon;

GRANT UPDATE (
  slug, name, logo_url, primary_color, secondary_color, description,
  establishment_type, address, city, country, phone, table_count,
  notification_sound_id, currency, tax_rate, service_charge_rate,
  enable_tax, enable_service_charge, idle_timeout_minutes,
  screen_lock_mode, default_locale, supported_currencies,
  enable_coupons, bar_display_enabled, opening_hours,
  onboarding_completed, onboarding_completed_at, updated_at
) ON public.tenants TO authenticated;
