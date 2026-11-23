-- ============================================================================
-- Audit B24 (CRITIQUE): une carte ne peut etre rattachee qu'a une carte et a un
-- espace DU MEME restaurant, et jamais a elle-meme.
--
-- CE QUI NE TENAIT PAS. `menus.parent_menu_id` et `menus.venue_id` ne portent
-- que des cles etrangeres, qui ignorent la RLS, et les politiques d'ecriture de
-- `menus` ne regardent que `tenant_id`. L'administrateur du restaurant A pouvait
-- donc creer une carte active dont le parent est une carte du restaurant B: la
-- vitrine de B (jointure `children:menus!parent_menu_id`, client service_role)
-- l'affichait comme onglet. Verifie en base par l'orchestrateur: aucun
-- declencheur, 0 cas existant aujourd'hui.
--
-- LA GARDE. Un declencheur BEFORE INSERT OR UPDATE refuse:
--   - `parent_menu_id = id` (carte qui serait son propre parent);
--   - un `parent_menu_id` qui ne designe pas une carte du meme `tenant_id`;
--   - un `venue_id` qui ne designe pas un espace du meme `tenant_id`.
-- Le service applicatif fait le meme controle (menu.mutations.ts) pour un
-- message clair; cette garde couvre tous les autres chemins (PostgREST direct,
-- scripts, futurs ecrivains).
--
-- SECURITY INVOKER: une garde n'a aucune raison de s'executer avec les droits
-- du proprietaire. La comparaison porte sur `tenant_id`, pas sur la visibilite:
-- une carte de B lisible par la politique publique reste refusee pour A.
--
-- ADDITIVE: aucune donnee modifiee, aucun droit retire. Peut passer AVANT ou
-- APRES le deploiement du code (0 ligne existante en infraction).
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS menus_same_tenant_links ON public.menus;
--   DROP FUNCTION IF EXISTS public.menus_same_tenant_links();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.menus_same_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.parent_menu_id IS NOT NULL THEN
    IF NEW.parent_menu_id = NEW.id THEN
      RAISE EXCEPTION 'MENU_SELF_PARENT: a menu cannot be its own parent'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.menus m
      WHERE m.id = NEW.parent_menu_id AND m.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'MENU_PARENT_OTHER_TENANT: parent menu must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.venue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = NEW.venue_id AND v.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'MENU_VENUE_OTHER_TENANT: venue must belong to the same tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.menus_same_tenant_links() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.menus_same_tenant_links() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS menus_same_tenant_links ON public.menus;
CREATE TRIGGER menus_same_tenant_links
  BEFORE INSERT OR UPDATE OF parent_menu_id, venue_id, tenant_id ON public.menus
  FOR EACH ROW EXECUTE FUNCTION public.menus_same_tenant_links();
