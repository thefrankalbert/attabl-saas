-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B124 (Basse). Deux restaurants de groupes
-- differents ne deviennent plus etablis avec le meme nom.
--
-- CE QUI NE TENAIT PAS. `trg_tenant_name_cross_group_unique` ne se lancait que
-- sur INSERT ou UPDATE de `name`, alors que la regle ne compte que les
-- restaurants etablis (`onboarding_completed = true`). L'onboarding ecrit le
-- nom a une etape et le drapeau a une etape suivante
-- (`onboarding.complete.ts`): deux comptes qui terminent avec le meme nom au
-- meme moment passent tous deux l'etape du nom (aucun n'est encore etabli),
-- puis deviennent etablis sans controle.
--
-- LA CORRECTION.
-- 1. Le declencheur se lance aussi sur UPDATE de `onboarding_completed`,
--    `group_id` et `deleted_at`.
-- 2. La fonction prend un verrou de transaction sur le nom normalise avant de
--    chercher un doublon: la seconde ecriture attend la premiere.
-- 3. Pour ne bloquer aucun geste sans rapport sur un doublon ancien: un
--    restaurant ferme (`deleted_at`) ne concurrence personne, et un UPDATE
--    n'est juge que s'il change le nom, passe en etabli, change de groupe ou
--    rouvre le restaurant.
-- Corps recopie du texte STOCKE en production (lu le 2026-11-24,
-- `lot-b2b1/prod-fonctions.sql`). L'application traduit deja le refus
-- (`isTenantNameConflictError`); l'etape finale de l'onboarding le traduit
-- aussi desormais (`RESTAURANT_NAME_TAKEN`). Droits reposes a l'identique.
--
-- ORDRE DE DEPLOIEMENT: APRES le code en ligne de preference (le code en
-- ligne afficherait "Failed to complete onboarding" au lieu de "nom deja
-- pris" sur ce refus nouveau, qui ne survient qu'en cas de course reelle).
--
-- ROLLBACK: rejouer le corps de prod-fonctions.sql et recreer le declencheur
--   BEFORE INSERT OR UPDATE OF name ON public.tenants.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_tenant_name_cross_group_unique()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- B124: un restaurant ferme ne concurrence personne; et sur UPDATE, on ne
  -- juge que ce qui peut creer un doublon (le nom, le passage en etabli, le
  -- changement de groupe, la reouverture). Un UPDATE sans rapport ne doit pas
  -- echouer sur un doublon ancien, anterieur a cette garde.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NOT (coalesce(NEW.onboarding_completed, false) AND NOT coalesce(OLD.onboarding_completed, false))
     AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
     AND NOT (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Deux comptes qui terminent en meme temps avec le meme nom: le second
  -- attend la fin du premier, puis le voit etabli.
  PERFORM pg_advisory_xact_lock(hashtext('tenant_name:' || lower(btrim(NEW.name))));

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
$function$;

REVOKE ALL ON FUNCTION public.enforce_tenant_name_cross_group_unique() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_name_cross_group_unique() TO service_role;

DROP TRIGGER IF EXISTS trg_tenant_name_cross_group_unique ON public.tenants;
CREATE TRIGGER trg_tenant_name_cross_group_unique
  BEFORE INSERT OR UPDATE OF name, onboarding_completed, group_id, deleted_at ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_name_cross_group_unique();

COMMIT;
