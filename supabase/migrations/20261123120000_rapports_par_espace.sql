-- Rapports par espace (lot 4, PR A), plans Business et Enterprise.
-- ============================================================================
-- Un RESTAURANT (tenant) a plusieurs ESPACES (terrasse, piscine, lobby, bar...),
-- nommes librement dans Parametres > Espaces (table venues). Ces fonctions
-- comparent les espaces d'UN SEUL restaurant: chiffre d'affaires, commandes,
-- ticket moyen, meilleures ventes. Jamais d'agregat entre restaurants: chaque
-- requete filtre sur p_tenant_id.
--
-- 1. ESPACE D'UNE COMMANDE. orders.venue_id existait, mais aucune creation de
--    commande ne l'ecrivait. Un declencheur l'inscrit desormais a la creation
--    (et quand la commande change de table), depuis la zone de sa table: un
--    deplacement de table ou une suppression de zone ne reecrit plus le
--    chiffre passe des espaces (constat de la relecture adversariale).
--    Les commandes ANTERIEURES a cette migration ne sont pas reecrites: un
--    rattrapage par UPDATE modifierait leur updated_at et emettrait un
--    evenement temps reel par commande (contre-audit). Pour elles seules, les
--    rapports lisent l'espace de la zone actuelle de leur table. Une commande sans table
--    (a emporter, caisse sans table, chambre) n'a pas d'espace: elle est rangee
--    dans une ligne "sans espace" (venue_id NULL). Un espace qui n'appartient
--    pas au restaurant est traite de la meme facon. La somme des lignes egale
--    donc TOUJOURS le total du restaurant (test pgTAP).
--
-- 2. DROIT "reports.view" EN BASE. La page Rapports exige ce droit (owner,
--    admin, manager par defaut; le proprietaire peut le donner ou le retirer),
--    mais les fonctions SQL ne verifiaient que l'appartenance et le plan: un
--    serveur lisait le chiffre d'affaires par un appel direct (constat de la
--    relecture adversariale, faille deja presente sur les rapports Pro). Les
--    rapports par espace ET les cinq fonctions de ventes existantes
--    (get_daily_revenue, get_top_items, get_order_summary,
--    get_category_breakdown, get_server_performance) le verifient desormais.
--    get_staff_stock_report n'est pas concerne: il sert l'historique de stock
--    (droit inventory.view) et garde son enveloppe actuelle.
--
-- 3. CHIFFRE PAR JOUR A L'HEURE DU RESTAURANT. get_daily_revenue groupait par
--    DATE(created_at), c'est-a-dire par jour UTC: a Douala (UTC+1), les ventes
--    de 0 h a 1 h tombaient sur la barre de la veille (contre-audit). Son corps
--    recoit desormais p_timezone (fuseau du restaurant, resolveTenantTimezone
--    cote application; 'UTC' par defaut, comme avant, pour un appel sans fuseau).
--    Le type de retour ne change pas.
--
-- MEMES REGLES QUE LES RAPPORTS EXISTANTS (migration 20261112140000):
-- - chiffre d'affaires et nombre de commandes: registre payments, a la date de
--   chaque ligne ('completed' ajoute, 'refunded' retire), pourboire compris;
-- - meilleures ventes: commandes creees sur la periode, reglees ('paid' ou
--   'partial'), hors annulees, comme get_top_items.
--
-- ORDRE DES VERROUS: appartenance au restaurant D'ABORD (un non-membre
-- n'apprend rien du plan d'un autre restaurant), puis droit reports.view, puis
-- plan (tenant_effective_plan, l'essai actif compte comme Business). service_role
-- et super administrateur passent l'appartenance et le droit, comme partout.
-- anon n'execute rien.
--
-- REJEU. Rejouer 20261121120000 (verrous de plan) apres celle-ci recreerait les
-- enveloppes des ventes sans le droit reports.view: il faudrait alors rejouer
-- celle-ci. Les deux sont rejouables.
--
-- Additive et rejouable (CREATE OR REPLACE, REVOKE/GRANT idempotents).
-- Tests: supabase/tests/rls/rapports_par_espace.test.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Espace inscrit sur la commande.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inscrire_espace_commande()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A la creation, un espace deja fourni est garde. Quand la commande change
  -- de table, elle prend l'espace de la nouvelle table.
  IF TG_OP = 'INSERT' AND NEW.venue_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.table_id IS NOT DISTINCT FROM OLD.table_id THEN
    RETURN NEW;
  END IF;
  IF NEW.table_id IS NOT NULL THEN
    SELECT z.venue_id INTO NEW.venue_id
      FROM tables t
      JOIN zones z ON z.id = t.zone_id AND z.tenant_id = t.tenant_id
     WHERE t.id = NEW.table_id AND t.tenant_id = NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inscrire_espace_commande() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inscrire_espace_commande ON public.orders;
CREATE TRIGGER trg_inscrire_espace_commande
  BEFORE INSERT OR UPDATE OF table_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.inscrire_espace_commande();

-- ----------------------------------------------------------------------------
-- 2. Droit reports.view en base.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_tenant_reports_view(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    RETURN;
  END IF;
  -- Meme resolution que l'application: role, surcharge du role, surcharge
  -- individuelle (has_tenant_write_permission, DEFAULT_PERMISSIONS).
  IF NOT public.has_tenant_write_permission(p_tenant_id, 'reports.view') THEN
    RAISE EXCEPTION 'Reports require the reports.view permission'
      USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_tenant_reports_view(uuid) FROM PUBLIC, anon, authenticated;

-- Rapports de ventes Pro: appartenance, droit, puis plan Pro ou plus. Le nom
-- CONTIENT "assert_tenant_reports": la migration 20261121120000 reconnait ses
-- enveloppes a ce texte (une fonction qui ne le contient pas est prise pour un
-- vrai corps et renommee). Le garder evite qu'un rejeu ne casse les ventes.
CREATE OR REPLACE FUNCTION public.assert_tenant_reports_ventes(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_reports_view(p_tenant_id);
  PERFORM public.assert_tenant_reports(p_tenant_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_tenant_reports_ventes(uuid) FROM PUBLIC, anon, authenticated;

-- Fuseau horaire fourni par l'application: refuse s'il n'est pas connu de
-- PostgreSQL, plutot que de produire des jours ou des heures faux. Conversion
-- d'essai plutot que pg_timezone_names, qui relit les fichiers de fuseaux a
-- chaque appel (27 ms mesures, contre moins de 1 ms).
CREATE OR REPLACE FUNCTION public.assert_valid_timezone(p_timezone text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_timezone IS NULL THEN
    RAISE EXCEPTION 'Unknown time zone: %', p_timezone USING ERRCODE = '22023';
  END IF;
  PERFORM now() AT TIME ZONE p_timezone;
EXCEPTION
  WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Unknown time zone: %', p_timezone USING ERRCODE = '22023';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_valid_timezone(text) FROM PUBLIC, anon, authenticated;

-- Corps du chiffre par jour, avec le fuseau. L'ancienne signature (3
-- arguments) et son enveloppe disparaissent: l'enveloppe est recreee juste en
-- dessous a partir de la nouvelle signature stockee. Memes regles que
-- 20261112140000 (registre, 'refunded' retire), seul le jour change.
DROP FUNCTION IF EXISTS public.get_daily_revenue(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_daily_revenue_brut(uuid, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.get_daily_revenue_brut(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE(day date, revenue numeric, order_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  PERFORM public.assert_valid_timezone(p_timezone);
  RETURN QUERY
  SELECT (p.created_at AT TIME ZONE p_timezone)::date AS day,
    COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0)::NUMERIC AS revenue,
    COUNT(DISTINCT p.order_id) FILTER (WHERE p.status = 'completed')::BIGINT AS order_count
  FROM payments p
  WHERE p.tenant_id = p_tenant_id AND p.created_at >= p_start_date AND p.created_at <= p_end_date
  GROUP BY 1 ORDER BY 1 ASC;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_daily_revenue_brut(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- Les enveloppes des cinq fonctions de ventes sont recreees a partir de la
-- signature STOCKEE de leur corps <nom>_brut (20261121120000): rien n'est
-- recopie, seul l'appel de verrou change.
DO $$
DECLARE
  v_nom  text;
  v_brut regprocedure;
  v_args text;
  v_call text;
  v_ident text;
BEGIN
  FOREACH v_nom IN ARRAY ARRAY['get_daily_revenue', 'get_top_items', 'get_order_summary',
                               'get_category_breakdown', 'get_server_performance']
  LOOP
    SELECT p.oid::regprocedure,
           pg_get_function_arguments(p.oid),
           pg_get_function_identity_arguments(p.oid),
           (SELECT string_agg(quote_ident(a), ', ' ORDER BY i)
              FROM unnest(p.proargnames) WITH ORDINALITY AS t(a, i)
             WHERE i <= p.pronargs)
      INTO v_brut, v_args, v_ident, v_call
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = v_nom || '_brut';

    IF v_brut IS NULL THEN
      RAISE EXCEPTION 'Missing % (apply 20261121120000 first)', v_nom || '_brut';
    END IF;

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s '
      'LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$ '
      'BEGIN PERFORM public.assert_tenant_reports_ventes(p_tenant_id); '
      'RETURN QUERY SELECT * FROM public.%I(%s); END; $f$',
      v_nom, v_args, pg_get_function_result(v_brut), v_nom || '_brut', v_call);

    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', v_nom, v_ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', v_nom, v_ident);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Rapports Business: appartenance, droit reports.view, puis plan Business
-- ou Enterprise.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_tenant_business_reports(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_reports_view(p_tenant_id);
  IF public.tenant_effective_plan(p_tenant_id) NOT IN ('business', 'enterprise') THEN
    RAISE EXCEPTION 'Advanced reports require the Business plan or higher'
      USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.assert_tenant_business_reports(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Chiffre d'affaires, commandes et ticket moyen par espace.
-- Une ligne par espace actif du restaurant (meme sans vente: la comparaison
-- montre aussi l'espace qui ne vend pas), plus les espaces inactifs qui ont
-- vendu sur la periode, plus la ligne "sans espace" si elle a des ventes.
-- Montants en unites mineures (BIGINT), comme payments.amount.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_venue_report(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(venue_id uuid, venue_name text, revenue bigint, order_count bigint, avg_basket bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  WITH registre AS (
    SELECT ve.id AS espace,
           p.order_id,
           p.status,
           p.amount
      FROM payments p
      JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
      -- Commandes anterieures a la migration (venue_id vide): zone de leur table.
      LEFT JOIN tables t ON o.venue_id IS NULL AND t.id = o.table_id AND t.tenant_id = o.tenant_id
      LEFT JOIN zones z ON z.id = t.zone_id AND z.tenant_id = o.tenant_id
      LEFT JOIN venues ve ON ve.id = COALESCE(o.venue_id, z.venue_id) AND ve.tenant_id = o.tenant_id
     WHERE p.tenant_id = p_tenant_id
       AND p.created_at >= p_start_date
       AND p.created_at <= p_end_date
  ),
  par_espace AS (
    SELECT r.espace,
           SUM(CASE WHEN r.status = 'refunded' THEN -r.amount ELSE r.amount END)::bigint AS ca,
           (COUNT(DISTINCT r.order_id) FILTER (WHERE r.status = 'completed'))::bigint AS nb
      FROM registre r
     GROUP BY r.espace
  ),
  lignes AS (
    SELECT v.id AS l_id, v.name::text AS l_nom, COALESCE(a.ca, 0)::bigint AS l_ca, COALESCE(a.nb, 0)::bigint AS l_nb
      FROM venues v
      LEFT JOIN par_espace a ON a.espace = v.id
     WHERE v.tenant_id = p_tenant_id
       AND (v.is_active OR a.espace IS NOT NULL)
    UNION ALL
    SELECT NULL::uuid, NULL::text, a.ca, a.nb
      FROM par_espace a
     WHERE a.espace IS NULL
  )
  SELECT l.l_id,
         l.l_nom,
         l.l_ca,
         l.l_nb,
         CASE WHEN l.l_nb > 0 THEN ROUND(l.l_ca::numeric / l.l_nb)::bigint ELSE 0::bigint END
    FROM lignes l
   ORDER BY l.l_ca DESC, l.l_nom ASC NULLS LAST, l.l_id ASC NULLS LAST;
END;
$$;

-- ----------------------------------------------------------------------------
-- Meilleures ventes par espace: les p_limit plats les plus vendus (quantite)
-- de chaque espace, et de la ligne "sans espace". p_limit borne a 1..20.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_venue_top_items(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(venue_id uuid, item_id uuid, item_name text, quantity_sold bigint, revenue bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  WITH ventes AS (
    SELECT ve.id AS espace,
           oi.menu_item_id AS plat,
           MAX(oi.item_name)::text AS nom,
           SUM(oi.quantity)::bigint AS qte,
           SUM(oi.quantity * oi.price_at_order)::bigint AS ca
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      -- Commandes anterieures a la migration (venue_id vide): zone de leur table.
      LEFT JOIN tables t ON o.venue_id IS NULL AND t.id = o.table_id AND t.tenant_id = o.tenant_id
      LEFT JOIN zones z ON z.id = t.zone_id AND z.tenant_id = o.tenant_id
      LEFT JOIN venues ve ON ve.id = COALESCE(o.venue_id, z.venue_id) AND ve.tenant_id = o.tenant_id
     WHERE o.tenant_id = p_tenant_id
       AND o.created_at >= p_start_date
       AND o.created_at <= p_end_date
       AND o.status != 'cancelled'
       AND o.payment_status IN ('paid', 'partial')
     GROUP BY ve.id, oi.menu_item_id
  ),
  classees AS (
    SELECT v.*, row_number() OVER (PARTITION BY v.espace ORDER BY v.qte DESC, v.ca DESC, v.nom ASC, v.plat ASC) AS rang
      FROM ventes v
  )
  SELECT c.espace, c.plat, c.nom, c.qte, c.ca
    FROM classees c
   WHERE c.rang <= LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20)
   ORDER BY c.espace NULLS LAST, c.rang;
END;
$$;

REVOKE ALL ON FUNCTION public.get_venue_report(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_venue_report(uuid, timestamptz, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_venue_top_items(uuid, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_venue_top_items(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;
