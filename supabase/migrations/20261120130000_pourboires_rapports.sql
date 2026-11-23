-- Lot pourboires (audit du 2026-11-20, constats C et D).
--
-- C. Les pourboires n'apparaissaient dans aucun rapport: `get_order_summary`
--    renvoyait `total_tips`, mais sur la date de CREATION des commandes,
--    alors que les revenus suivent la date d'ENCAISSEMENT (registre
--    `payments`, migration 20261112140000). Les deux chiffres d'une meme
--    periode ne portaient donc pas sur les memes commandes. `total_tips` suit
--    desormais `orders.paid_at`, la date ou le pourboire est encaisse.
--    Signature inchangee: CREATE OR REPLACE garde les droits EXECUTE.
--
-- D. Pas de pourboires par serveur: `get_server_performance` gagne une colonne
--    `tips` (somme de `tip_amount` des commandes reglees du serveur, meme base
--    de date). Un type de retour ne change pas par CREATE OR REPLACE: la
--    fonction est supprimee puis recreee DANS LA MEME TRANSACTION, avec les
--    droits relus dans supabase/schema.sql (REVOKE PUBLIC, GRANT authenticated
--    et service_role). Une colonne en plus ne casse pas l'ancien code, qui lit
--    les colonnes par leur nom.
--
-- G (controle du plan sur `tip_amount`) n'est PAS ici: un seul verrou de plan,
-- le declencheur `enforce_order_plan_features` de la PR #444 (commit c3e58866),
-- fonde sur `tenant_effective_plan`. Il ne protege qu'une fois #444 fusionnee.
--
-- ORDRE AVEC #444. Une migration de #444 enveloppe `get_order_summary` et
-- `get_server_performance` dans un controle de plan (corps renomme en
-- `<nom>_brut`). Celle-ci doit donc passer AVANT elle: son numero est
-- inferieur. Si elle etait rejouee APRES, elle remplacerait l'enveloppe; il
-- suffirait alors de rejouer la migration d'enveloppe de #444.
--
-- Rejouable: CREATE OR REPLACE et DROP ... IF EXISTS partout.
--
-- Rollback: rejouer `get_order_summary` et `get_server_performance` de
-- 20261112140000 (DROP de la nouvelle `get_server_performance` d'abord, puis
-- remettre les memes droits).

BEGIN;

-- ----------------------------------------------------------------------------
-- C. Resume des commandes: pourboires sur la date d'encaissement.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_order_summary(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(total_revenue numeric, total_orders bigint, avg_basket numeric, total_tax numeric, total_service_charge numeric, total_discounts numeric, total_tips numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_revenue NUMERIC;
  v_orders BIGINT;
  v_tips NUMERIC;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  SELECT COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0),
         COUNT(DISTINCT p.order_id) FILTER (WHERE p.status = 'completed')
    INTO v_revenue, v_orders
  FROM payments p
  WHERE p.tenant_id = p_tenant_id AND p.created_at >= p_start_date AND p.created_at <= p_end_date;

  -- Pourboires ENCAISSES sur la periode: commandes reglees (ou reglees puis
  -- remboursees en partie, statut 'partial') dont l'encaissement tombe dans la
  -- periode. Un offert ('comp') et une annulation n'en ont pas.
  SELECT COALESCE(SUM(o.tip_amount), 0)
    INTO v_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.paid_at >= p_start_date AND o.paid_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial');

  RETURN QUERY
  SELECT v_revenue::NUMERIC AS total_revenue,
    v_orders::BIGINT AS total_orders,
    CASE WHEN v_orders > 0 THEN ROUND(v_revenue / v_orders, 2) ELSE 0 END::NUMERIC AS avg_basket,
    COALESCE(SUM(o.tax_amount), 0)::NUMERIC AS total_tax,
    COALESCE(SUM(o.service_charge_amount), 0)::NUMERIC AS total_service_charge,
    COALESCE(SUM(o.discount_amount), 0)::NUMERIC AS total_discounts,
    v_tips::NUMERIC AS total_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial');
END;
$function$;

-- Droits de la production (supabase/schema.sql: authenticated et service_role)
-- rendus explicites: une base locale Supabase accorde EXECUTE a anon par defaut.
REVOKE ALL ON FUNCTION public.get_order_summary(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;

-- ----------------------------------------------------------------------------
-- D. Performance des serveurs: colonne `tips`.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.get_server_performance(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(server_id uuid, server_name text, orders bigint, revenue numeric, tips numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  WITH encaisse AS (
    SELECT
      o.server_id AS sid,
      COUNT(DISTINCT o.id) FILTER (WHERE p.status = 'completed')::BIGINT AS nb,
      SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)::NUMERIC AS ca
    FROM payments p
    JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
    WHERE p.tenant_id = p_tenant_id
      AND p.created_at >= p_start_date
      AND p.created_at <= p_end_date
      AND o.server_id IS NOT NULL
    GROUP BY o.server_id
  ),
  pourboires AS (
    -- Meme regle que get_order_summary.total_tips.
    SELECT o.server_id AS sid, SUM(o.tip_amount)::NUMERIC AS pb
    FROM orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.paid_at >= p_start_date
      AND o.paid_at <= p_end_date
      AND o.server_id IS NOT NULL
      AND o.status != 'cancelled'
      AND o.payment_status IN ('paid', 'partial')
    GROUP BY o.server_id
  )
  -- FULL JOIN: un serveur dont le pourboire est encaisse dans la periode sans
  -- ligne au registre dans cette meme periode (bornes) garde son pourboire.
  SELECT
    COALESCE(e.sid, pb.sid) AS server_id,
    COALESCE(au.full_name, COALESCE(e.sid, pb.sid)::TEXT)::TEXT AS server_name,
    COALESCE(e.nb, 0)::BIGINT AS orders,
    COALESCE(e.ca, 0)::NUMERIC AS revenue,
    COALESCE(pb.pb, 0)::NUMERIC AS tips
  FROM encaisse e
  FULL JOIN pourboires pb ON pb.sid = e.sid
  LEFT JOIN admin_users au ON au.id = COALESCE(e.sid, pb.sid)
  ORDER BY COALESCE(e.nb, 0) DESC;
END;
$function$;

ALTER FUNCTION public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone) OWNER TO postgres;
-- `anon` explicitement: les privileges par defaut de Supabase l'accordent a
-- toute fonction creee, et la production ne l'ouvre qu'a authenticated.
REVOKE ALL ON FUNCTION public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
GRANT ALL ON FUNCTION public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_server_performance(uuid, timestamp with time zone, timestamp with time zone) TO service_role;

COMMIT;
