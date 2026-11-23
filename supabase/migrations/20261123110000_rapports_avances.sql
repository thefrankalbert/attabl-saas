-- Rapports avances (lot 4, PR B), plans Business et Enterprise.
-- ============================================================================
-- Cinq rapports, tous sur UN SEUL restaurant (filtre p_tenant_id partout):
--   1. get_dish_margins           marge par plat (fiches techniques)
--   2. get_sales_heatmap          heures fortes (jour x heure, heure du restaurant)
--   3. get_period_comparison      semaine contre semaine, mois contre mois
--   4. get_payment_method_report  repartition par moyen de paiement (registre)
--   5. get_stock_losses_report    pertes et gaspillage par ingredient
--
-- VERROUS: chaque fonction appelle assert_tenant_business_reports
-- (20261123100000): appartenance au restaurant D'ABORD, puis droit
-- reports.view (comme la page), puis plan Business ou Enterprise (l'essai actif
-- compte comme Business). anon n'execute rien.
--
-- ARGENT: payments.amount et order_items.price_at_order sont en unites
-- mineures (BIGINT). ingredients.cost_per_unit est en unites MAJEURES
-- (NUMERIC, cout d'une unite de base de l'ingredient): les couts sont donc
-- renvoyes en unites majeures et convertis par l'application
-- (toMinorUnits, devise du restaurant), sans arrondi intermediaire en SQL.
--
-- MEMES REGLES QUE LES RAPPORTS EXISTANTS (20261112140000):
-- - chiffre d'affaires et commandes: registre payments a la date de chaque
--   ligne ('completed' ajoute, 'refunded' retire), pourboire compris;
-- - ventes par plat: commandes creees sur la periode, reglees ('paid' ou
--   'partial'), hors annulees, comme get_top_items.
--
-- Additive et rejouable (CREATE OR REPLACE, REVOKE/GRANT idempotents).
-- Tests: supabase/tests/rls/rapports_avances.test.sql.
-- ============================================================================

-- Fuseau horaire fourni par l'application (resolveTenantTimezone): refuse s'il
-- n'est pas connu de PostgreSQL, plutot que de produire des heures fausses.
-- Conversion d'essai plutot que pg_timezone_names, qui relit les fichiers de
-- fuseaux a chaque appel (27 ms mesures, contre moins de 1 ms).
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

-- ----------------------------------------------------------------------------
-- 1. Marge par plat.
-- Une ligne par plat vendu sur la periode. unit_cost = somme(quantite de la
-- fiche x cout unitaire de l'ingredient), en unites majeures, au cout ACTUEL
-- des ingredients. has_recipe = faux si le plat n'a aucune ligne de fiche:
-- l'ecran l'affiche comme tel au lieu d'inventer une marge. cost_complete =
-- faux si un ingredient de la fiche n'a pas de cout (cost_per_unit = 0).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dish_margins(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  item_id uuid,
  item_name text,
  quantity_sold bigint,
  revenue bigint,
  has_recipe boolean,
  cost_complete boolean,
  unit_cost numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  WITH ventes AS (
    SELECT oi.menu_item_id AS plat,
           MAX(oi.item_name)::text AS nom,
           SUM(oi.quantity)::bigint AS qte,
           SUM(oi.quantity * oi.price_at_order)::bigint AS ca
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE o.tenant_id = p_tenant_id
       AND o.created_at >= p_start_date
       AND o.created_at <= p_end_date
       AND o.status != 'cancelled'
       AND o.payment_status IN ('paid', 'partial')
     GROUP BY oi.menu_item_id
  ),
  fiches AS (
    SELECT r.menu_item_id AS plat,
           SUM(r.quantity_needed * i.cost_per_unit) AS cout,
           bool_and(i.cost_per_unit > 0) AS complet
      FROM recipes r
      JOIN ingredients i ON i.id = r.ingredient_id AND i.tenant_id = r.tenant_id
     WHERE r.tenant_id = p_tenant_id
     GROUP BY r.menu_item_id
  )
  SELECT v.plat, v.nom, v.qte, v.ca,
         (f.plat IS NOT NULL),
         COALESCE(f.complet, false),
         f.cout
    FROM ventes v
    LEFT JOIN fiches f ON f.plat = v.plat
   ORDER BY v.ca DESC, v.nom ASC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Heures fortes: chiffre d'affaires et commandes par jour de la semaine
-- (1 = lundi ... 7 = dimanche, ISO) et par heure (0..23), a l'heure du
-- restaurant. Seules les cases qui ont des ventes sont renvoyees.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sales_heatmap(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_timezone text
)
RETURNS TABLE(day_of_week integer, hour_of_day integer, revenue bigint, order_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);
  PERFORM public.assert_valid_timezone(p_timezone);

  RETURN QUERY
  SELECT EXTRACT(isodow FROM (p.created_at AT TIME ZONE p_timezone))::integer,
         EXTRACT(hour FROM (p.created_at AT TIME ZONE p_timezone))::integer,
         SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)::bigint,
         (COUNT(DISTINCT p.order_id) FILTER (WHERE p.status = 'completed'))::bigint
    FROM payments p
   WHERE p.tenant_id = p_tenant_id
     AND p.created_at >= p_start_date
     AND p.created_at <= p_end_date
   GROUP BY 1, 2
   ORDER BY 1, 2;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Comparaison avec la periode precedente, a l'heure du restaurant.
-- p_mode 'week': semaine en cours (depuis lundi 0 h) contre la meme duree de
-- la semaine precedente. 'month': mois en cours contre la meme duree du mois
-- precedent (borne a la fin de ce mois). Deux lignes: 'current', 'previous'.
-- Les chiffres viennent de get_order_summary_brut: memes regles que le
-- resume des rapports.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_period_comparison(
  p_tenant_id uuid,
  p_mode text,
  p_timezone text
)
RETURNS TABLE(
  period text,
  start_at timestamptz,
  end_at timestamptz,
  revenue bigint,
  order_count bigint,
  avg_basket bigint,
  tips bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_now timestamp;
  v_cur_start timestamp;
  v_prev_start timestamp;
  v_prev_end timestamp;
  v_step interval;
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);
  PERFORM public.assert_valid_timezone(p_timezone);
  IF p_mode NOT IN ('week', 'month') THEN
    RAISE EXCEPTION 'Unknown comparison mode: %', p_mode USING ERRCODE = '22023';
  END IF;

  v_step := CASE p_mode WHEN 'week' THEN interval '1 week' ELSE interval '1 month' END;
  v_local_now := now() AT TIME ZONE p_timezone;
  v_cur_start := date_trunc(p_mode, v_local_now);
  v_prev_start := v_cur_start - v_step;
  -- Meme duree ecoulee, sans deborder sur la periode en cours (un 31 contre un
  -- mois precedent de 30 jours s'arrete a la fin de ce mois).
  v_prev_end := LEAST(v_prev_start + (v_local_now - v_cur_start), v_cur_start - interval '1 microsecond');

  RETURN QUERY
  SELECT b.p, b.s, b.e,
         s.total_revenue::bigint,
         s.total_orders::bigint,
         ROUND(s.avg_basket)::bigint,
         s.total_tips::bigint
    FROM (VALUES
            ('current'::text, v_cur_start AT TIME ZONE p_timezone, now()),
            ('previous'::text, v_prev_start AT TIME ZONE p_timezone, v_prev_end AT TIME ZONE p_timezone)
         ) AS b(p, s, e)
   CROSS JOIN LATERAL public.get_order_summary_brut(p_tenant_id, b.s, b.e) s;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Repartition par moyen de paiement (registre payments).
-- encaisse = lignes 'completed', rembourse = lignes 'refunded', net = encaisse
-- moins rembourse (pourboire compris, comme le chiffre d'affaires).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_payment_method_report(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(method text, collected bigint, refunded bigint, net bigint, payment_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  SELECT p.method::text,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0)::bigint,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'refunded'), 0)::bigint,
         SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)::bigint,
         (COUNT(*) FILTER (WHERE p.status = 'completed'))::bigint
    FROM payments p
   WHERE p.tenant_id = p_tenant_id
     AND p.created_at >= p_start_date
     AND p.created_at <= p_end_date
   GROUP BY p.method
   ORDER BY 4 DESC, 1 ASC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Pertes et gaspillage: mouvements de stock de type 'loss', par
-- ingredient. Quantite dans l'unite de base de l'ingredient; valeur au cout
-- unitaire ACTUEL, en unites majeures (comme get_losses_by_reason).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_stock_losses_report(
  p_tenant_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS TABLE(
  ingredient_id uuid,
  ingredient_name text,
  unit text,
  quantity numeric,
  cost_value numeric,
  movement_count bigint,
  main_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_business_reports(p_tenant_id);

  RETURN QUERY
  WITH pertes AS (
    SELECT sm.ingredient_id AS ing, ABS(sm.quantity) AS qte, sm.reason_code AS motif
      FROM stock_movements sm
     WHERE sm.tenant_id = p_tenant_id
       AND sm.movement_type = 'loss'
       AND sm.created_at >= p_start_date
       AND sm.created_at <= p_end_date
  ),
  motifs AS (
    SELECT DISTINCT ON (x.ing) x.ing, x.motif
      FROM (SELECT ing, motif, SUM(qte) AS q FROM pertes GROUP BY ing, motif) x
     ORDER BY x.ing, x.q DESC, x.motif ASC NULLS LAST
  )
  SELECT i.id, i.name::text, i.unit::text,
         SUM(pe.qte),
         SUM(pe.qte * i.cost_per_unit),
         COUNT(*)::bigint,
         m.motif::text
    FROM pertes pe
    JOIN ingredients i ON i.id = pe.ing AND i.tenant_id = p_tenant_id
    LEFT JOIN motifs m ON m.ing = pe.ing
   GROUP BY i.id, i.name, i.unit, m.motif
   ORDER BY 5 DESC, 2 ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dish_margins(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dish_margins(uuid, timestamptz, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_sales_heatmap(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_heatmap(uuid, timestamptz, timestamptz, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_period_comparison(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_period_comparison(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_payment_method_report(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_method_report(uuid, timestamptz, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_stock_losses_report(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_losses_report(uuid, timestamptz, timestamptz) TO authenticated, service_role;
