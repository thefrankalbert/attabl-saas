-- Restaurant NAME uniqueness across different owners.
--
-- Business rule: a restaurant name may be reused only WITHIN the same owner's
-- group (an owner branching their own franchise). A DIFFERENT account must not
-- be able to create / finalize a restaurant whose name is already used by
-- another account's established restaurant (e.g. no second "McDonald").
--
-- Slug is already globally unique (tenants_slug_key); name had no constraint.
-- A plain UNIQUE cannot express "unique across groups, allowed within a group",
-- so this is enforced with a BEFORE INSERT/UPDATE trigger. The check runs
-- SECURITY DEFINER because owner RLS hides other groups' tenants.
--
-- Only ESTABLISHED restaurants (onboarding_completed = true, attached to a group)
-- reserve a name. This is deliberate:
--   - Signup inserts a tenant with a placeholder name and group_id NULL, then
--     sets group_id afterwards. Enforcing at that point would break signup and
--     would collide on the shared default placeholder ("Mon Etablissement").
--   - The name a customer actually keeps is the one written when they complete
--     onboarding (which also flips onboarding_completed to true) or when an owner
--     adds a named restaurant to their group. Those are the writes we guard.
--
-- Comparison is case-insensitive and trimmed; soft-deleted tenants are ignored.
-- Same group is always allowed (franchise branches).

CREATE INDEX IF NOT EXISTS idx_tenants_name_ci
  ON tenants (lower(btrim(name)))
  WHERE deleted_at IS NULL AND onboarding_completed = true AND group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_tenant_name_cross_group_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only a tenant attached to a group can collide with another group's name.
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tenants t
    WHERE t.id <> NEW.id
      AND t.deleted_at IS NULL
      AND t.onboarding_completed = true
      AND t.group_id IS NOT NULL
      AND t.group_id <> NEW.group_id
      AND lower(btrim(t.name)) = lower(btrim(NEW.name))
  ) THEN
    RAISE EXCEPTION 'tenant_name_cross_group_conflict'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_name_cross_group_unique ON tenants;
CREATE TRIGGER trg_tenant_name_cross_group_unique
  BEFORE INSERT OR UPDATE OF name ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION enforce_tenant_name_cross_group_unique();

REVOKE ALL ON FUNCTION enforce_tenant_name_cross_group_unique() FROM PUBLIC;
