-- Rapports par espace (lot 4, PR A), plans Business et Enterprise.
-- ============================================================================
-- Un RESTAURANT (tenant) a plusieurs ESPACES (terrasse, piscine, lobby, bar...),
-- nommes librement dans Parametres > Espaces (table venues). Ces fonctions
-- comparent les espaces d'UN SEUL restaurant: chiffre d'affaires, commandes,
-- ticket moyen, meilleures ventes. Jamais d'agregat entre restaurants: chaque
-- requete filtre sur p_tenant_id.
--
-- ESPACE D'UNE COMMANDE. orders.venue_id existe mais aucune creation de
-- commande ne l'ecrit aujourd'hui. L'espace est donc lu, dans l'ordre:
--   1. orders.venue_id s'il est renseigne;
--   2. sinon l'espace de la zone de la table (orders.table_id -> tables.zone_id
--      -> zones.venue_id).
-- Une commande sans table (a emporter, caisse sans table, chambre) n'a pas
-- d'espace: elle est rangee dans une ligne "sans espace" (venue_id NULL). Un
-- espace qui n'appartient pas au restaurant est traite de la meme facon. Ainsi
-- la somme des lignes egale TOUJOURS le total du restaurant (test pgTAP).
--
-- MEMES REGLES QUE LES RAPPORTS EXISTANTS (migration 20261112140000):
-- - chiffre d'affaires et nombre de commandes: registre payments, a la date de
--   chaque ligne ('completed' ajoute, 'refunded' retire), pourboire compris;
-- - meilleures ventes: commandes creees sur la periode, reglees ('paid' ou
--   'partial'), hors annulees, comme get_top_items.
--
-- VERROUS: appartenance au restaurant D'ABORD (un non-membre n'apprend rien du
-- plan d'un autre restaurant), PUIS plan Business ou Enterprise
-- (tenant_effective_plan, l'essai actif compte comme Business). Meme modele que
-- assert_tenant_reports (20261121120000). anon n'execute rien.
--
-- Additive et rejouable (CREATE OR REPLACE, REVOKE/GRANT idempotents).
-- Tests: supabase/tests/rls/rapports_par_espace.test.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_tenant_business_reports(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
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
      LEFT JOIN tables t ON t.id = o.table_id AND t.tenant_id = o.tenant_id
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
   ORDER BY l.l_ca DESC, l.l_nom ASC NULLS LAST;
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
      LEFT JOIN tables t ON t.id = o.table_id AND t.tenant_id = o.tenant_id
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
    SELECT v.*, row_number() OVER (PARTITION BY v.espace ORDER BY v.qte DESC, v.ca DESC, v.nom ASC) AS rang
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
