-- Tighten tenants table RLS:
-- 1. Rename the old policy for clarity
-- 2. Add security-definer functions for safe public tenant lookups by slug/id
--    (these expose only non-sensitive columns and can be used to migrate away
--    from the public SELECT policy in the future)
-- 3. Keep a public SELECT policy on active tenants (required by customer-facing
--    order/coupon flows that use the anon key). No API route returns unbounded
--    tenant lists, so enumeration risk is mitigated at the API layer.

-- Step 1: Drop the old policy and recreate with a clearer name
DROP POLICY IF EXISTS "Tenants are publicly readable" ON tenants;
CREATE POLICY "Public can read active tenants" ON tenants
  FOR SELECT USING (is_active = true);

-- Step 2: Create security-definer functions for public tenant lookups
-- These are the preferred path for new code — they expose only safe columns.

CREATE OR REPLACE FUNCTION public.get_tenant_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  logo_url text,
  currency text,
  tax_rate numeric,
  service_charge_rate numeric,
  enable_tax boolean,
  enable_service_charge boolean,
  establishment_type text,
  is_active boolean,
  subscription_plan text,
  subscription_status text,
  trial_ends_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    t.id, t.name, t.slug, t.logo_url, t.currency,
    t.tax_rate, t.service_charge_rate, t.enable_tax, t.enable_service_charge,
    t.establishment_type, t.is_active, t.subscription_plan, t.subscription_status,
    t.trial_ends_at
  FROM tenants t
  WHERE t.slug = p_slug AND t.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_by_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_by_slug(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tenant_public_by_id(p_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  currency text,
  tax_rate numeric,
  service_charge_rate numeric,
  enable_tax boolean,
  enable_service_charge boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    t.id, t.name, t.slug, t.currency,
    t.tax_rate, t.service_charge_rate, t.enable_tax, t.enable_service_charge
  FROM tenants t
  WHERE t.id = p_id AND t.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_public_by_id(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_public_by_id(uuid) TO authenticated;
