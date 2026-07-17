-- Venues (espaces de restauration) - plan limit enforcement at the data layer
-- ============================================================================
-- The admin action actionCreateVenue gates creation with canAddVenue (per-plan
-- maxVenues in src/lib/plans/features.ts). This trigger mirrors that limit at the
-- database layer so an INSERT via PostgREST (anon key, bypassing the action) is
-- denied too. Effective plan matches getEffectivePlan(): active trial -> pro,
-- else the tenant's own plan, else starter.
--
-- maxVenues parity (must match PLAN_LIMITS): starter=1, pro=2, business=10,
-- enterprise=unlimited. Guarded by venues-entitlement-parity.test.ts.
--
-- SECURITY DEFINER so the trigger can read `tenants` regardless of the writer RLS.
-- Only counts is_active venues (matches canAddVenue).
--
-- Fires on INSERT and UPDATE (mirrors the QR paywall precedent) so a tenant
-- cannot bypass the cap by inserting inactive venues then flipping is_active
-- to true via a plain UPDATE/PATCH. A rename or any update that leaves
-- is_active unchanged is not blocked; only INSERT of an active row or a
-- false->true reactivation consumes a slot.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_venue_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan       text;
  v_status     text;
  v_trial_ends timestamptz;
  v_effective  text;
  v_max        int;
  v_count      int;
BEGIN
  -- Only enforce when a venue becomes (or is created) active. A rename or any
  -- update that leaves is_active unchanged/true-to-true must not be blocked;
  -- only INSERT of an active row or a false->true reactivation consumes a slot.
  IF NOT (NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active = false)) THEN
    RETURN NEW;
  END IF;

  SELECT subscription_plan, subscription_status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends
  FROM tenants
  WHERE id = NEW.tenant_id;

  -- Effective plan (mirror getEffectivePlan)
  IF v_status = 'trial' AND v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    v_effective := 'pro';
  ELSIF v_plan IN ('starter', 'pro', 'business', 'enterprise') THEN
    v_effective := v_plan;
  ELSE
    v_effective := 'starter';
  END IF;

  -- Per-plan cap (mirror PLAN_LIMITS.maxVenues ; NULL = unlimited)
  v_max := CASE v_effective
    WHEN 'starter'    THEN 1
    WHEN 'pro'        THEN 2
    WHEN 'business'   THEN 10
    WHEN 'enterprise' THEN NULL
    ELSE 1
  END;

  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM venues
    WHERE tenant_id = NEW.tenant_id AND is_active = true;

    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Venue limit reached for plan %', v_effective
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_venue_plan_limit ON public.venues;

CREATE TRIGGER trg_enforce_venue_plan_limit
  BEFORE INSERT OR UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_venue_plan_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_venue_plan_limit() FROM PUBLIC, anon, authenticated;

-- Prevent duplicate venue slugs within a tenant (closes concurrent same-name
-- creates persisting duplicate slugs; slug becomes a routing key in the
-- venue-aware storefront sub-project).
CREATE UNIQUE INDEX IF NOT EXISTS venues_tenant_slug_uniq
  ON public.venues (tenant_id, slug);
