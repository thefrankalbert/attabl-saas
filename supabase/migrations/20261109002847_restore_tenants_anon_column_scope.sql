-- Applied to production on 2026-11-09.
-- Restores the anon column scope of 20260731000100_tenants_anon_column_scope (DB-02),
-- which 20261108225032 widened by mistake. Stripe ids / activation_events stay excluded.
revoke all on table public.tenants from anon;

grant select (
  id,
  slug,
  name,
  logo_url,
  primary_color,
  secondary_color,
  description,
  establishment_type,
  currency,
  tax_rate,
  service_charge_rate,
  enable_tax,
  enable_service_charge,
  enable_coupons,
  supported_currencies,
  opening_hours,
  default_locale,
  is_active,
  table_count,
  custom_domain,
  deleted_at
) on table public.tenants to anon;
