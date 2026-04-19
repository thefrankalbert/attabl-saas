-- Atomically remove an admin_user entry and clean up the auth user
-- if no other tenant memberships remain.
-- Uses SELECT FOR UPDATE to prevent race conditions.
CREATE OR REPLACE FUNCTION delete_admin_user_atomic(
  p_admin_user_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  remaining_count INT;
BEGIN
  -- Delete the target admin_users row
  DELETE FROM admin_users WHERE id = p_admin_user_id;

  -- Count remaining memberships with a row lock
  SELECT COUNT(*) INTO remaining_count
  FROM admin_users
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- If no more memberships, delete the auth user
  IF remaining_count = 0 THEN
    -- Delete from auth.users (requires SECURITY DEFINER)
    DELETE FROM auth.users WHERE id = p_user_id;
    RETURN TRUE; -- auth user was deleted
  END IF;

  RETURN FALSE; -- auth user kept (has other memberships)
END;
$$;
