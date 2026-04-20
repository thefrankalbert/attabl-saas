-- Privilege-escalation guard on admin_users.
-- A tenant owner could previously UPDATE their own admin_users row to set
-- role = 'super_admin' or is_super_admin = true via the applicative layer
-- (RLS allows admins to update rows in their tenant). This trigger blocks
-- any such elevation unless the caller is already a super_admin, closing
-- the path to platform-wide takeover via a compromised owner account.

CREATE OR REPLACE FUNCTION public.prevent_super_admin_elevation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_super_admin boolean := false;
  service_role_call boolean := false;
BEGIN
  -- Service role (used by webhooks and trusted server-side code) bypasses.
  -- Detect via the jwt role claim; when unset or empty, fall back to checking
  -- the PostgreSQL role name.
  BEGIN
    service_role_call := coalesce(
      current_setting('request.jwt.claim.role', true) = 'service_role',
      false
    );
  EXCEPTION WHEN OTHERS THEN
    service_role_call := false;
  END;

  IF service_role_call THEN
    RETURN NEW;
  END IF;

  -- Fast path: nothing changed.
  IF (OLD.role IS NOT DISTINCT FROM NEW.role)
     AND (OLD.is_super_admin IS NOT DISTINCT FROM NEW.is_super_admin) THEN
    RETURN NEW;
  END IF;

  -- If the update tries to grant super_admin (either via role or boolean flag)
  -- check that the caller is already a super_admin.
  IF (NEW.role = 'super_admin' AND OLD.role IS DISTINCT FROM 'super_admin')
     OR (NEW.is_super_admin = true AND OLD.is_super_admin IS DISTINCT FROM true) THEN

    SELECT coalesce(
      (SELECT au.is_super_admin
         FROM admin_users au
         WHERE au.user_id = auth.uid()
         LIMIT 1),
      false
    ) INTO caller_is_super_admin;

    IF NOT caller_is_super_admin THEN
      RAISE EXCEPTION
        'Only super_admin users can grant super_admin privileges'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Symmetric guard: a non-super_admin cannot strip super_admin flags either
  -- (avoids accidentally demoting oneself out of the role).
  IF (OLD.role = 'super_admin' AND NEW.role IS DISTINCT FROM 'super_admin')
     OR (OLD.is_super_admin = true AND NEW.is_super_admin IS DISTINCT FROM true) THEN

    SELECT coalesce(
      (SELECT au.is_super_admin
         FROM admin_users au
         WHERE au.user_id = auth.uid()
         LIMIT 1),
      false
    ) INTO caller_is_super_admin;

    IF NOT caller_is_super_admin THEN
      RAISE EXCEPTION
        'Only super_admin users can revoke super_admin privileges'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_super_admin_elevation_trg ON public.admin_users;
CREATE TRIGGER prevent_super_admin_elevation_trg
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_super_admin_elevation();

COMMENT ON FUNCTION public.prevent_super_admin_elevation IS
  'Blocks non-super_admin callers from granting or revoking super_admin
   role/is_super_admin flag via UPDATE. Service role bypasses.';
