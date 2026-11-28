-- Lot 1 des roles du personnel, MIG3 : garde du prix par colonne, protection du
-- proprietaire en base (conception : docs/roles-personnel/conception-lot1.md,
-- D.1 et D.4).
--
-- POURQUOI.
--   1. Prix. La politique UPDATE de `menu_items` laisse ecrire toutes les
--      colonnes : sans garde par colonne, retirer `menu.price` a un chef ne
--      ferait que masquer un champ a l'ecran.
--   2. Proprietaire. Aucune garde en base aujourd'hui, alors que les actions
--      d'equipe ecrivent en service_role (la RLS ne les couvre pas). Le poste
--      `owner` ne se donne ni ne se retire, et la ligne du proprietaire d'un
--      restaurant vivant ne se supprime pas, pour personne.
--
-- A SAVOIR. Supprimer physiquement le compte auth.users du proprietaire d'un
-- restaurant ouvert est desormais refuse (la cascade atteint sa ligne). Il faut
-- supprimer ou fermer le restaurant d'abord. La base n'empeche PAS de
-- desactiver la ligne du proprietaire (is_active, deleted_at, banned_at) : la
-- plateforme en a besoin ; cote restaurant c'est l'application qui le refuse.
--
-- RETOUR ARRIERE : supabase/retour-arriere/20261128100200_retour_gardes_prix_et_proprietaire.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Prix de la carte
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garder_prix_carte() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  -- SECURITY INVOKER voulu : current_user doit etre celui de l'appelant (en
  -- DEFINER il vaudrait toujours le proprietaire de la fonction et la garde ne
  -- se declencherait jamais). service_role, postgres, taches planifiees et
  -- fonctions SECURITY DEFINER : hors de cette garde.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.price IS NOT DISTINCT FROM OLD.price
       AND NEW.prices IS NOT DISTINCT FROM OLD.prices THEN
      RETURN NEW;
    END IF;
  ELSIF coalesce(NEW.price, 0) = 0 AND NEW.prices IS NULL THEN
    -- INSERT sans prix (un modificateur gratuit) : `menu.edit` suffit.
    RETURN NEW;
  END IF;
  IF NOT public.has_tenant_write_permission(NEW.tenant_id, 'menu.price') THEN
    RAISE EXCEPTION 'changing a price requires the menu.price permission'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.garder_prix_carte() FROM PUBLIC, anon, authenticated, service_role;

-- menu_items : UPDATE seulement, l'INSERT exige deja `menu.price` par sa
-- politique (MIG2). item_modifiers : INSERT et UPDATE.
DROP TRIGGER IF EXISTS trg_menu_items_prix ON public.menu_items;
CREATE TRIGGER trg_menu_items_prix BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.garder_prix_carte();
DROP TRIGGER IF EXISTS trg_item_modifiers_prix ON public.item_modifiers;
CREATE TRIGGER trg_item_modifiers_prix BEFORE INSERT OR UPDATE ON public.item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.garder_prix_carte();

-- ---------------------------------------------------------------------------
-- 2. Proprietaire
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER sans danger ici : la regle vaut pour tout le monde, elle ne
-- depend pas de l'appelant et n'a donc pas besoin de current_user.
CREATE OR REPLACE FUNCTION private.garder_proprietaire() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ('owner' = ANY (OLD.postes)) IS DISTINCT FROM ('owner' = ANY (NEW.postes)) THEN
      RAISE EXCEPTION 'the owner poste cannot be granted or removed' USING ERRCODE = '42501';
    END IF;
    IF 'owner' = ANY (OLD.postes)
       AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
      RAISE EXCEPTION 'the owner row cannot be reassigned' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  -- DELETE : interdit tant que le restaurant existe et n'est pas ferme. La
  -- suppression en cascade depuis tenants passe (la ligne tenants n'est plus
  -- visible quand la cascade arrive), delete_my_account sur un restaurant
  -- ferme passe aussi.
  IF 'owner' = ANY (OLD.postes) AND EXISTS (
       SELECT 1 FROM public.tenants AS t WHERE t.id = OLD.tenant_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'the owner of a live restaurant cannot be removed' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION private.garder_proprietaire() FROM PUBLIC, anon, authenticated, service_role;

-- Passe APRES aa_admin_users_sync_postes (ordre alphabetique) : il voit les
-- postes definitifs. Un ancien code qui tenterait `role = 'owner'` par UPDATE
-- est donc refuse.
DROP TRIGGER IF EXISTS garder_proprietaire_trg ON public.admin_users;
CREATE TRIGGER garder_proprietaire_trg BEFORE UPDATE OR DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION private.garder_proprietaire();

COMMIT;
