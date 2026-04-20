-- Extend the super_admin elevation guard to cover INSERT.
-- The previous migration (20260420010000) only guarded UPDATE, leaving an
-- INSERT path unrestricted. Today INSERT only happens via service_role (signup
-- + invitation flows) so the exposure is theoretical, but adding the INSERT
-- branch makes the trigger defense-in-depth complete: if a future policy ever
-- allows authenticated INSERT into admin_users, the caller still cannot seed
-- themselves a super_admin row.

DROP TRIGGER IF EXISTS prevent_super_admin_elevation_trg ON public.admin_users;

CREATE TRIGGER prevent_super_admin_elevation_trg
  BEFORE INSERT OR UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_super_admin_elevation();

-- Update the function to handle the INSERT case. The existing UPDATE branches
-- compare OLD vs NEW; on INSERT, OLD is null, so we check NEW alone.

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
  -- Service role (webhooks, trusted server-side code) bypasses.
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

  -- INSERT path: any attempt to seed a super_admin row requires the caller to
  -- already be a super_admin.
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'super_admin' OR NEW.is_super_admin = true THEN
      SELECT coalesce(
        (SELECT au.is_super_admin
           FROM admin_users au
           WHERE au.user_id = auth.uid()
           LIMIT 1),
        false
      ) INTO caller_is_super_admin;

      IF NOT caller_is_super_admin THEN
        RAISE EXCEPTION
          'Only super_admin users can create a super_admin row'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE path: fast exit when nothing changed.
  IF (OLD.role IS NOT DISTINCT FROM NEW.role)
     AND (OLD.is_super_admin IS NOT DISTINCT FROM NEW.is_super_admin) THEN
    RETURN NEW;
  END IF;

  -- Grant super_admin: require caller to already be super_admin.
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

  -- Revoke super_admin: same gate to avoid accidental self-demotion.
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

COMMENT ON FUNCTION public.prevent_super_admin_elevation IS
  'Blocks non-super_admin callers from seeding/modifying super_admin role or
   is_super_admin flag via INSERT or UPDATE. Service role bypasses.';
