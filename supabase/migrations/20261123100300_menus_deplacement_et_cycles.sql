-- ============================================================================
-- Contre-audit D3 du lot B1, complement de 20261123100000 (audit B24).
--
-- CE QUI RESTAIT OUVERT. La garde "meme restaurant" de 20261123100000 ne
-- regarde que la ligne `menus` modifiee. Un utilisateur qui a le droit
-- d'ecrire dans DEUX restaurants pouvait donc, APRES COUP:
--   - deplacer une salle (`venues.tenant_id`) vers l'autre restaurant, alors
--     que des cartes du premier y restent rattachees;
--   - deplacer une carte parente (`menus.tenant_id`) vers l'autre restaurant,
--     alors que ses sous-cartes restent dans le premier.
-- Et un cycle de parents (A a pour parent B, B a pour parent A) etait accepte:
-- la vitrine n'affichait alors aucune des deux cartes.
--
-- LA GARDE.
--   1. `menus_same_tenant_links` (CREATE OR REPLACE, meme declencheur) refuse en
--      plus tout cycle de parents, a n'importe quelle profondeur.
--   2. Un declencheur sur `menus` refuse un changement de `tenant_id` tant que
--      des sous-cartes d'un autre restaurant le referenceraient.
--   3. Un declencheur sur `venues` refuse un changement de `tenant_id` tant que
--      des cartes d'un autre restaurant y resteraient rattachees.
--   4. Contre-audits E1 et F1: les lectures de ces gardes ne voient pas les
--      lignes non validees d'une autre transaction. Deux actions simultanees
--      fermaient donc un cycle (E1), ou recreaient un lien vers l'autre
--      restaurant en deplacant le parent ou la salle pendant qu'on s'y
--      rattachait (F1). Toute ecriture qui cree un lien ou deplace une carte
--      ou une salle prend un verrou consultatif par restaurant concerne, et la
--      lecture qui suit (nouvelle image en READ COMMITTED) voit l'etat valide.
--      Pas de `SELECT ... FOR SHARE`: sous RLS, il applique la politique UPDATE
--      de `venues` (settings.edit) et masquerait la salle a un gerant qui a le
--      droit de modifier les cartes mais pas les salles (verifie par essai).
-- SECURITY INVOKER partout: une garde n'a aucune raison de s'executer avec les
-- droits du proprietaire. Les lignes qui comptent (cartes du restaurant
-- d'origine) appartiennent a l'utilisateur qui deplace, donc lui sont visibles.
--
-- ADDITIVE: aucune donnee modifiee, aucun droit retire. Aucun code de
-- l'application ne change `tenant_id` sur `menus` ni `venues`. Peut passer
-- AVANT ou APRES le deploiement du code, apres 20261123100000.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS menus_tenant_move_keeps_children ON public.menus;
--   DROP TRIGGER IF EXISTS venues_tenant_move_keeps_menus ON public.venues;
--   DROP FUNCTION IF EXISTS public.menus_tenant_move_keeps_children();
--   DROP FUNCTION IF EXISTS public.venues_tenant_move_keeps_menus();
--   puis reposer menus_same_tenant_links de 20261123100000.
-- ============================================================================

-- 1. Liens d'une carte: meme restaurant, pas son propre parent, pas de cycle --
CREATE OR REPLACE FUNCTION public.menus_same_tenant_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_autre uuid;
BEGIN
  -- Verrou consultatif par restaurant (contre-audits E1 et F1), pris AVANT
  -- toute lecture. Une transaction concurrente qui deplace le parent ou la
  -- salle, ou qui pose un lien de parente, dans ce restaurant, est attendue.
  -- Pour un changement de restaurant, les DEUX restaurants sont verrouilles,
  -- toujours le plus petit identifiant d'abord (meme ordre dans les trois
  -- gardes: pas d'interblocage entre elles). Cle a DEUX entiers: tous les
  -- autres verrous consultatifs du depot (destock_order, restock_order,
  -- table_session, venue_cap, tables_init, owner_trial, numerotation) utilisent
  -- la forme a UNE cle, et PostgreSQL tient les deux espaces separes. Aucune
  -- fonction SQL n'ecrit dans `menus` en prenant un autre verrou.
  IF NEW.parent_menu_id IS NOT NULL OR NEW.venue_id IS NOT NULL
     OR (TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    v_autre := CASE WHEN TG_OP = 'UPDATE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(LEAST(NEW.tenant_id, v_autre)::text));
    IF v_autre IS DISTINCT FROM NEW.tenant_id THEN
      PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(GREATEST(NEW.tenant_id, v_autre)::text));
    END IF;
  END IF;

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
    -- Remonter les parents depuis le nouveau parent: si l'on retombe sur
    -- cette carte, le lien fermerait un cycle. CYCLE arrete la recursion sur
    -- un cycle deja present en base, sans boucler.
    IF EXISTS (
      WITH RECURSIVE ancetres(id, parent_menu_id) AS (
        SELECT m.id, m.parent_menu_id FROM public.menus m WHERE m.id = NEW.parent_menu_id
        UNION ALL
        SELECT m.id, m.parent_menu_id
        FROM public.menus m
        JOIN ancetres a ON m.id = a.parent_menu_id
      ) CYCLE id SET est_cycle USING chemin
      SELECT 1 FROM ancetres WHERE parent_menu_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'MENU_PARENT_CYCLE: parent link would create a cycle'
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

-- 2. Deplacer une carte parente: ses sous-cartes ne doivent pas rester ailleurs
CREATE OR REPLACE FUNCTION public.menus_tenant_move_keeps_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    -- Contre-audit F1: meme verrou que menus_same_tenant_links, sur les deux
    -- restaurants, le plus petit identifiant d'abord.
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(LEAST(OLD.tenant_id, NEW.tenant_id)::text));
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(GREATEST(OLD.tenant_id, NEW.tenant_id)::text));
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id AND EXISTS (
    SELECT 1 FROM public.menus c
    WHERE c.parent_menu_id = NEW.id AND c.tenant_id <> NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'MENU_MOVE_ORPHANS_CHILDREN: sub-menus would point to another tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.menus_tenant_move_keeps_children() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.menus_tenant_move_keeps_children() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS menus_tenant_move_keeps_children ON public.menus;
CREATE TRIGGER menus_tenant_move_keeps_children
  BEFORE UPDATE OF tenant_id ON public.menus
  FOR EACH ROW EXECUTE FUNCTION public.menus_tenant_move_keeps_children();

-- 3. Deplacer une salle: les cartes rattachees ne doivent pas rester ailleurs --
CREATE OR REPLACE FUNCTION public.venues_tenant_move_keeps_menus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    -- Contre-audit F1: meme verrou que menus_same_tenant_links, sur les deux
    -- restaurants, le plus petit identifiant d'abord.
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(LEAST(OLD.tenant_id, NEW.tenant_id)::text));
    PERFORM pg_advisory_xact_lock(hashtext('menus_tree'), hashtext(GREATEST(OLD.tenant_id, NEW.tenant_id)::text));
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id AND EXISTS (
    SELECT 1 FROM public.menus m
    WHERE m.venue_id = NEW.id AND m.tenant_id <> NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'VENUE_MOVE_ORPHANS_MENUS: menus would point to a venue of another tenant'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.venues_tenant_move_keeps_menus() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.venues_tenant_move_keeps_menus() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS venues_tenant_move_keeps_menus ON public.venues;
CREATE TRIGGER venues_tenant_move_keeps_menus
  BEFORE UPDATE OF tenant_id ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_tenant_move_keeps_menus();
