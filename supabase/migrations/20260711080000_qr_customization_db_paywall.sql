-- QR customization paywall - database-level enforcement
-- ============================================================================
-- The QR customization feature (persisting a custom style/template into
-- qr_designs) is a Pro+ entitlement. The server action actionSaveQrDesign gates
-- it with canAccessFeature('canAccessQrCustomization', ...), but the qr_designs
-- RLS policies authorize ANY tenant member with no plan check, so a logged-in
-- user on a non-entitled plan could bypass the action and write directly to
-- PostgREST (/rest/v1/qr_designs) with the anon key. That is a revenue/entitlement
-- gap (same-tenant only, no cross-tenant exposure, no real charge), not an IDOR.
--
-- This trigger enforces the same entitlement at the data layer, so persistence is
-- denied regardless of the client path. It mirrors canAccessFeature EXACTLY
-- (src/lib/plans/features.ts): a tenant is entitled when its EFFECTIVE plan is
-- pro/business/enterprise, where the effective plan is:
--   - 'pro' during an active trial (status='trial' AND trial_ends_at in the future),
--   - otherwise the tenant's own subscription_plan (grace period: cancelled /
--     paused / past_due keep their last plan),
--   - 'starter' when the plan is missing/unrecognized.
-- Since canAccessQrCustomization is true for pro/business/enterprise and false for
-- starter, entitlement reduces to: active-trial OR plan in (pro,business,enterprise).
--
-- The server action stays as the fast-fail UX layer; this is defense in depth.
-- SECURITY DEFINER so the trigger can read `tenants` regardless of the writer's RLS.
--
-- NOTE: depends on the qr_designs table (migration 20260704000000_qr_designs.sql).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_qr_customization_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan       text;
  v_status     text;
  v_trial_ends timestamptz;
  v_entitled   boolean;
BEGIN
  SELECT subscription_plan, subscription_status, trial_ends_at
    INTO v_plan, v_status, v_trial_ends
  FROM tenants
  WHERE id = NEW.tenant_id;

  v_entitled :=
    (v_status = 'trial' AND v_trial_ends IS NOT NULL AND v_trial_ends > now())
    OR (v_plan IN ('pro', 'business', 'enterprise'));

  IF NOT v_entitled THEN
    RAISE EXCEPTION 'QR customization requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger creation is not idempotent on its own; drop-if-exists makes the
-- migration safely re-runnable.
DROP TRIGGER IF EXISTS trg_enforce_qr_customization_entitlement ON public.qr_designs;

CREATE TRIGGER trg_enforce_qr_customization_entitlement
  BEFORE INSERT OR UPDATE ON public.qr_designs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_qr_customization_entitlement();

-- The trigger function must not be callable directly by clients.
REVOKE EXECUTE ON FUNCTION public.enforce_qr_customization_entitlement() FROM PUBLIC, anon, authenticated;
