-- Verrous de plan en base, suite du contre-audit des offres (2026-11-20)
-- ============================================================================
-- Le proprietaire exige des verrous cote serveur PARTOUT: un appel direct a
-- PostgREST ou a une fonction SQL doit etre refuse comme l'interface. Tous les
-- verrous s'appuient sur public.tenant_effective_plan (20261120120000).
--
-- 1. Tables et zones: l'exception d'onboarding reposait sur
--    tenants.onboarding_completed, que le client peut ecrire (attaque: le
--    remettre a false, creer des tables, le remettre a true). Elle repose
--    desormais sur un registre que le client ne peut ni lire ni ecrire:
--    tenant_tables_initialisees. La premiere creation de tables d'un restaurant
--    (onboarding) passe, quel que soit le plan; ensuite il faut Pro ou plus.
-- 2. Assignations: l'UPDATE qui reactive ou deplace une assignation existante
--    (creee pendant l'essai) est ferme comme l'INSERT.
-- 3. Stock et fiches techniques: depuis que l'essai donne tout, un ancien essai
--    devenu Starter garde ses ingredients. Sont fermes hors Pro: les fiches
--    techniques (recipes), les mouvements de stock MANUELS (ajout, perte,
--    reception, ouverture, comptage, transfert; le destockage d'une commande
--    reste ouvert), les lignes de comptage, et l'UPDATE direct d'un ingredient
--    par le client (les fonctions SQL de commande ecrivent sous leur
--    proprietaire et ne sont pas concernees).
-- 4. Ecran cuisine (KDS, Pro et plus): les gestes propres a l'ecran cuisine
--    (statut d'un article, envoi ou retenue d'un service) sont fermes hors Pro,
--    SAUF pour une commande passee avant la fin de l'essai (decision produit
--    du 2026-11-09: la cuisine finit les commandes de l'essai).
-- 5. Rapports (Pro et plus): les fonctions d'agregat des rapports sont fermees
--    hors Pro. Chaque fonction garde son nom et sa signature: le corps existant
--    est renomme en <nom>_brut (inaccessible aux clients), et une enveloppe
--    verifie le plan puis l'appelle. Aucun corps n'est recopie, donc aucune
--    derive possible.
--
-- Additive et rejouable. Tests: supabase/tests/rls/verrous_plan_suite.test.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables et zones
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_tables_initialisees (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  initialisees_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_tables_initialisees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_tables_initialisees FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.tenant_tables_initialisees IS
  'Restaurants dont les tables de depart existent deja. Ecrit par un trigger, illisible par les clients.';

-- Les restaurants qui ont deja des tables sont initialises.
INSERT INTO public.tenant_tables_initialisees (tenant_id)
SELECT DISTINCT tenant_id FROM public.tables
ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_tables_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Premiere creation de tables du restaurant (onboarding): incluse partout.
  IF NOT EXISTS (SELECT 1 FROM tenant_tables_initialisees WHERE tenant_id = NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Table management requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Marque le restaurant initialise APRES l'instruction qui a cree ses tables:
-- toutes les lignes d'un meme INSERT multi-lignes (onboarding) passent.
CREATE OR REPLACE FUNCTION public.marquer_tables_initialisees()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tenant_tables_initialisees (tenant_id)
  SELECT DISTINCT tenant_id FROM nouvelles_tables
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_marquer_tables_initialisees ON public.tables;
CREATE TRIGGER trg_marquer_tables_initialisees
  AFTER INSERT ON public.tables
  REFERENCING NEW TABLE AS nouvelles_tables
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.marquer_tables_initialisees();

-- ----------------------------------------------------------------------------
-- 2. Assignations: INSERT et UPDATE qui deplace ou reactive.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_service_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Terminer une assignation (ended_at pose) reste permis: c'est du menage.
  IF TG_OP = 'UPDATE'
     AND NEW.server_id IS NOT DISTINCT FROM OLD.server_id
     AND NEW.table_id IS NOT DISTINCT FROM OLD.table_id
     AND NOT (OLD.ended_at IS NOT NULL AND NEW.ended_at IS NULL) THEN
    RETURN NEW;
  END IF;

  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Server assignment requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_service_entitlement ON public.table_assignments;
CREATE TRIGGER trg_enforce_service_entitlement
  BEFORE INSERT OR UPDATE ON public.table_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_service_entitlement();

-- ----------------------------------------------------------------------------
-- 3. Stock et fiches techniques
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_recipes_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Recipes require the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_recipes_entitlement ON public.recipes;
CREATE TRIGGER trg_enforce_recipes_entitlement
  BEFORE INSERT OR UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_recipes_entitlement();

-- Mouvements de stock: seuls les mouvements MANUELS sont fermes. Le destockage
-- et le restockage d'une commande (order_destock, order_restock) restent
-- ouverts: le paywall empeche d'utiliser le module, pas de servir un client.
CREATE OR REPLACE FUNCTION public.enforce_stock_movement_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.movement_type IN ('order_destock', 'order_restock') THEN
    RETURN NEW;
  END IF;
  IF public.tenant_effective_plan(NEW.tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_stock_movement_entitlement ON public.stock_movements;
CREATE TRIGGER trg_enforce_stock_movement_entitlement
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_stock_movement_entitlement();

DROP TRIGGER IF EXISTS trg_enforce_inventory_entitlement ON public.stock_count_lines;
CREATE TRIGGER trg_enforce_inventory_entitlement
  BEFORE INSERT OR UPDATE ON public.stock_count_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_inventory_entitlement();

-- UPDATE d'un ingredient: ferme au CLIENT direct (role authenticated) hors Pro.
-- SECURITY INVOKER pour lire le role reel de l'appelant: les fonctions de
-- commande (destock_order...) ecrivent sous leur proprietaire et passent.
CREATE OR REPLACE FUNCTION public.enforce_ingredient_update_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT public.mon_restaurant_a_le_stock(NEW.tenant_id) THEN
    RAISE EXCEPTION 'Inventory module requires the Pro plan or higher'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ingredient_update_entitlement ON public.ingredients;
CREATE TRIGGER trg_enforce_ingredient_update_entitlement
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ingredient_update_entitlement();

-- Le trigger ci-dessus tourne avec les droits du client: il lui faut une
-- fonction appelable par `authenticated`, qui ne revele RIEN sur un restaurant
-- dont l'appelant n'est pas membre (tenant_effective_plan reste fermee).
CREATE OR REPLACE FUNCTION public.mon_restaurant_a_le_stock(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_tenant_id = ANY (public.get_my_tenant_ids_array())
     AND public.tenant_effective_plan(p_tenant_id) IN ('pro', 'business', 'enterprise');
$$;
REVOKE ALL ON FUNCTION public.mon_restaurant_a_le_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mon_restaurant_a_le_stock(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. Ecran cuisine (KDS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_kds_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.item_status IS NOT DISTINCT FROM OLD.item_status
     AND NEW.held IS NOT DISTINCT FROM OLD.held THEN
    RETURN NEW;
  END IF;

  IF public.tenant_effective_plan(NEW.tenant_id) IN ('pro', 'business', 'enterprise') THEN
    RETURN NEW;
  END IF;

  -- Commande passee pendant l'essai: la cuisine la termine.
  IF EXISTS (
    SELECT 1
    FROM orders o
    JOIN tenants t ON t.id = o.tenant_id
    WHERE o.id = NEW.order_id
      AND t.trial_ends_at IS NOT NULL
      AND o.created_at < t.trial_ends_at
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Kitchen display requires the Pro plan or higher'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_kds_entitlement ON public.order_items;
CREATE TRIGGER trg_enforce_kds_entitlement
  BEFORE UPDATE OF item_status, held ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_kds_entitlement();

-- ----------------------------------------------------------------------------
-- 5. Rapports: enveloppes verifiant le plan.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_tenant_reports(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Appartenance D'ABORD: un non-membre ne doit rien apprendre du plan d'un
  -- autre restaurant (service_role et super admin passent, comme partout).
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF public.tenant_effective_plan(p_tenant_id) NOT IN ('pro', 'business', 'enterprise') THEN
    RAISE EXCEPTION 'Reports require the Pro plan or higher'
      USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_tenant_reports(uuid) FROM PUBLIC, anon, authenticated;

-- Renomme le corps existant une seule fois, puis (re)cree l'enveloppe a
-- partir de la signature STOCKEE du corps: arguments, valeurs par defaut et
-- type de retour sont lus dans pg_proc, jamais recopies. Rejouable.
DO $$
DECLARE
  v_nom  text;
  v_brut regprocedure;
  v_args text;
  v_call text;
  v_ident text;
BEGIN
  FOREACH v_nom IN ARRAY ARRAY['get_daily_revenue', 'get_top_items', 'get_order_summary',
                               'get_category_breakdown', 'get_server_performance',
                               'get_staff_stock_report']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace
                   AND proname = v_nom || '_brut') THEN
      EXECUTE format('ALTER FUNCTION public.%I RENAME TO %I', v_nom, v_nom || '_brut');
    END IF;

    SELECT p.oid::regprocedure,
           pg_get_function_arguments(p.oid),
           pg_get_function_identity_arguments(p.oid),
           (SELECT string_agg(quote_ident(a), ', ' ORDER BY i)
              FROM unnest(p.proargnames) WITH ORDINALITY AS t(a, i)
             WHERE i <= p.pronargs)
      INTO v_brut, v_args, v_ident, v_call
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_nom || '_brut';

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_brut);

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s '
      'LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ '
      'BEGIN PERFORM public.assert_tenant_reports(p_tenant_id); '
      'RETURN QUERY SELECT * FROM public.%I(%s); END; $f$',
      v_nom, v_args, pg_get_function_result(v_brut), v_nom || '_brut', v_call);

    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', v_nom, v_ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', v_nom, v_ident);
  END LOOP;
END $$;
