-- Recreate accept_invitation_membership RPC (SEV-1 fix).
--
-- The invitation acceptance flow (src/services/invitation.service.ts) calls
-- supabase.rpc('accept_invitation_membership', ...). This function was defined in
-- migration 20260519120000_p2_fk_atomic_signup_invitation.sql but is ABSENT from
-- the production database (its sibling provision_signup_tenant is present). As a
-- result NO invitation to a new user could ever be accepted in production
-- (0 accepted invitations all-time). This migration restores the function.
--
-- Idempotent + additive: CREATE OR REPLACE. The deployed application code already
-- calls this function, so restoring it cannot break anything - it only unblocks
-- the broken accept path. Body is identical to the canonical definition in
-- 20260519120000, kept in sync intentionally.

CREATE OR REPLACE FUNCTION accept_invitation_membership(
  p_invitation_id uuid,
  p_user_id uuid,
  p_full_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_inv invitations%ROWTYPE;
  v_slug text;
BEGIN
  SELECT * INTO v_inv
  FROM invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.expires_at < now() THEN
    UPDATE invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'INVITATION_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO admin_users (
    user_id,
    tenant_id,
    email,
    full_name,
    role,
    is_active,
    custom_permissions,
    created_by
  ) VALUES (
    p_user_id,
    v_inv.tenant_id,
    v_inv.email,
    COALESCE(NULLIF(trim(p_full_name), ''), v_inv.email),
    v_inv.role,
    true,
    v_inv.custom_permissions,
    v_inv.invited_by
  );

  UPDATE invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_inv.id;

  SELECT slug INTO v_slug FROM tenants WHERE id = v_inv.tenant_id;

  RETURN jsonb_build_object(
    'tenantId', v_inv.tenant_id,
    'tenantSlug', COALESCE(v_slug, '')
  );
END;
$body$;

-- Lock to service_role only. Supabase default privileges re-grant EXECUTE to
-- anon/authenticated on new public functions; strip them explicitly so an
-- authenticated user cannot self-insert into a tenant via a leaked invitation UUID
-- (this SECURITY DEFINER function is only ever called by the service_role client).
REVOKE EXECUTE ON FUNCTION accept_invitation_membership(uuid, uuid, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION accept_invitation_membership(uuid, uuid, text) TO service_role;
