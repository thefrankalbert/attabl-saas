-- Tighten qr_designs RLS so only ACTIVE tenant members can read/write designs.
--
-- SEC-01 (audit 2026-07-11): the original policies (20260704000000_qr_designs.sql)
-- authorized on a bare `tenant_id IN (SELECT tenant_id FROM admin_users WHERE
-- user_id = auth.uid())`, with no is_active filter. A deactivated member whose
-- admin_users row still exists could therefore read/insert/update/delete the
-- tenant's QR designs by calling PostgREST directly, even though the app layer
-- (getAuthenticatedUserWithTenant + get-session) already filters is_active = true.
-- This aligns the DB policies with that app-layer check.
--
-- Fine-grained permission enforcement (the `settings.edit` permission the server
-- actions require) intentionally stays app-layer: it lives in custom_permissions
-- (JSONB) + role and is non-trivial to mirror in SQL. RLS here is the
-- belt-and-suspenders membership/active filter, not the permission gate.
--
-- Rollback: recreate the four policies without `AND is_active` (see
-- 20260704000000_qr_designs.sql).

DROP POLICY IF EXISTS "Tenant members can view qr designs" ON qr_designs;
DROP POLICY IF EXISTS "Tenant members can insert qr designs" ON qr_designs;
DROP POLICY IF EXISTS "Tenant members can update qr designs" ON qr_designs;
DROP POLICY IF EXISTS "Tenant members can delete qr designs" ON qr_designs;

CREATE POLICY "Tenant members can view qr designs"
  ON qr_designs FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid() AND is_active)
  );

CREATE POLICY "Tenant members can insert qr designs"
  ON qr_designs FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid() AND is_active)
  );

CREATE POLICY "Tenant members can update qr designs"
  ON qr_designs FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid() AND is_active)
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid() AND is_active)
  );

CREATE POLICY "Tenant members can delete qr designs"
  ON qr_designs FOR DELETE
  USING (
    tenant_id IN (SELECT tenant_id FROM admin_users WHERE user_id = auth.uid() AND is_active)
  );
