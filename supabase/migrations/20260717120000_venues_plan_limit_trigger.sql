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
-- Fires AFTER INSERT and UPDATE (not BEFORE): an AFTER-row trigger's SELECT sees
-- the current transaction's own writes, INCLUDING sibling rows written earlier in
-- the SAME statement. A BEFORE-row count does NOT, so ONE PostgREST call writing N
-- active rows (JSON array insert, or a multi-row PATCH is_active=true) would slip
-- past a BEFORE cap. Because the just-written row is now counted, the threshold is
-- strict `>` (a single legit insert on starter: count becomes 1, 1 > 1 is false ->
-- allowed; a 2nd active row: count 2, 2 > 1 -> raise, rolls back the statement).
--
-- A per-tenant transaction-scoped advisory lock at the top serializes the cap
-- check across separate concurrent requests, so two simultaneous creates can't
-- both read a stale count and both pass. The lock auto-releases at commit/rollback.
--
-- A rename or any update that leaves is_active unchanged is not blocked; only
-- INSERT of an active row or a false->true reactivation consumes a slot.
--
-- A companion trigger (enforce_min_one_active_venue) guarantees each tenant keeps
-- at least one active venue, so a concurrent double-deactivation cannot drop the
-- tenant to zero active venues (which would break the storefront).
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
  -- Serialize cap checks per tenant so two concurrent creates can't both pass.
  -- Transaction-scoped: auto-released at commit/rollback.
  PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || NEW.tenant_id::text));

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
    -- AFTER trigger: this count includes the row(s) just written by the current
    -- statement, so the comparison is strict `>` (see file header).
    SELECT count(*) INTO v_count
    FROM venues
    WHERE tenant_id = NEW.tenant_id AND is_active = true;

    IF v_count > v_max THEN
      RAISE EXCEPTION 'Venue limit reached for plan %', v_effective
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_venue_plan_limit ON public.venues;

CREATE TRIGGER trg_enforce_venue_plan_limit
  AFTER INSERT OR UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_venue_plan_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_venue_plan_limit() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- Last-active-venue invariant - database backstop
-- ============================================================================
-- deactivateVenue guards "cannot deactivate the last active venue" only in app
-- code (count-then-update, racy). Two concurrent deactivations of the two
-- remaining active venues can each pass the app check -> 0 active venues, which
-- breaks the storefront. This AFTER trigger enforces the invariant at the data
-- layer under the same per-tenant advisory lock, so a concurrent
-- double-deactivation (or a delete of the last active venue) is rejected.
-- The app-layer guard stays as fast-fail UX (belt and suspenders).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_min_one_active_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Same per-tenant lock as the cap trigger (use OLD - the affected tenant).
  PERFORM pg_advisory_xact_lock(hashtext('venue_cap:' || OLD.tenant_id::text));

  -- Only act when a venue LEAVES the active set. Renames, reactivations, and
  -- deletes of already-inactive rows are untouched.
  IF NOT (
    (TG_OP = 'DELETE' AND OLD.is_active = true)
    OR (TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false)
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) INTO v_count
  FROM venues
  WHERE tenant_id = OLD.tenant_id AND is_active = true;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Cannot deactivate or delete the last active venue'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_min_one_active_venue ON public.venues;

CREATE TRIGGER trg_enforce_min_one_active_venue
  AFTER UPDATE OR DELETE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_min_one_active_venue();

REVOKE EXECUTE ON FUNCTION public.enforce_min_one_active_venue() FROM PUBLIC, anon, authenticated;

-- Prevent duplicate venue slugs within a tenant (closes concurrent same-name
-- creates persisting duplicate slugs; slug becomes a routing key in the
-- venue-aware storefront sub-project).
-- PRE-APPLY CHECK (run before applying, must return 0 rows):
--   SELECT tenant_id, slug, count(*) FROM venues GROUP BY 1,2 HAVING count(*) > 1;
-- If it returns rows, dedupe slugs first (append -2, -3, ... within the tenant).
CREATE UNIQUE INDEX IF NOT EXISTS venues_tenant_slug_uniq
  ON public.venues (tenant_id, slug);
