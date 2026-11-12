-- Chiffre d'affaires = argent ENCAISSE, lu dans le registre des paiements
-- (audit du 2026-11-10, C-041 ; decision du proprietaire du 2026-11-12).
--
-- POURQUOI. Les 5 fonctions de rapport ne comptaient que les commandes au
-- statut 'paid'. Une table qui n'a paye qu'un acompte (statut 'partial') et
-- une commande remboursee en partie (statut 'partial' aussi) disparaissaient
-- entierement du chiffre. Mesure de l'audit: 6 500 FCFA affiches, 9 000 FCFA
-- dans le registre (3 500 - 1 000 + 6 500).
--
-- REGLE. Une ligne 'completed' ajoute son montant, une ligne 'refunded' le
-- retire (un remboursement est une ligne a montant POSITIF, voir
-- record_refund). Elle compte le jour ou elle est enregistree
-- (payments.created_at), pourboire compris. Meme regle que
-- src/lib/orders/revenue.ts (tableau de bord).
-- - Montants (get_daily_revenue, get_order_summary.total_revenue et
--   avg_basket, get_server_performance.revenue): registre.
-- - Composition des ventes (plats, categories, taxes, remises, pourboires):
--   commandes creees sur la periode qui ont recu de l'argent ('paid' ou
--   'partial'), hors annulees. Un offert ('comp') n'entre jamais au registre
--   et reste exclu partout, comme avant.
--
-- Signatures, SECURITY DEFINER, search_path et garde assert_tenant_member
-- identiques aux definitions de production relues le 2026-11-12. CREATE OR
-- REPLACE conserve les droits EXECUTE existants.
--
-- Rollback: rejouer les 5 definitions precedentes, presentes telles quelles
-- dans supabase/schema.sql (instantane de production, inchange par cette
-- migration): rechercher "FUNCTION \"public\".\"get_daily_revenue\"" etc.

CREATE OR REPLACE FUNCTION public.get_daily_revenue(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(day date, revenue numeric, order_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT DATE(p.created_at) AS day,
    COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0)::NUMERIC AS revenue,
    COUNT(DISTINCT p.order_id) FILTER (WHERE p.status = 'completed')::BIGINT AS order_count
  FROM payments p
  WHERE p.tenant_id = p_tenant_id AND p.created_at >= p_start_date AND p.created_at <= p_end_date
  GROUP BY DATE(p.created_at) ORDER BY day ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_order_summary(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(total_revenue numeric, total_orders bigint, avg_basket numeric, total_tax numeric, total_service_charge numeric, total_discounts numeric, total_tips numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_revenue NUMERIC;
  v_orders BIGINT;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);

  SELECT COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0),
         COUNT(DISTINCT p.order_id) FILTER (WHERE p.status = 'completed')
    INTO v_revenue, v_orders
  FROM payments p
  WHERE p.tenant_id = p_tenant_id AND p.created_at >= p_start_date AND p.created_at <= p_end_date;

  RETURN QUERY
  SELECT v_revenue::NUMERIC AS total_revenue,
    v_orders::BIGINT AS total_orders,
    CASE WHEN v_orders > 0 THEN ROUND(v_revenue / v_orders, 2) ELSE 0 END::NUMERIC AS avg_basket,
    COALESCE(SUM(o.tax_amount), 0)::NUMERIC AS total_tax,
    COALESCE(SUM(o.service_charge_amount), 0)::NUMERIC AS total_service_charge,
    COALESCE(SUM(o.discount_amount), 0)::NUMERIC AS total_discounts,
    COALESCE(SUM(o.tip_amount), 0)::NUMERIC AS total_tips
  FROM orders o
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_top_items(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer DEFAULT 10)
 RETURNS TABLE(item_id uuid, item_name text, quantity_sold bigint, revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT oi.menu_item_id AS item_id, MAX(oi.item_name)::TEXT AS item_name,
    SUM(oi.quantity)::BIGINT AS quantity_sold,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = p_tenant_id AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    AND o.status != 'cancelled' AND o.payment_status IN ('paid', 'partial')
  GROUP BY oi.menu_item_id ORDER BY quantity_sold DESC LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_category_breakdown(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(category text, revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    c.name::TEXT AS category,
    SUM(oi.quantity * oi.price_at_order)::NUMERIC AS revenue
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  JOIN categories c ON c.id = mi.category_id
  WHERE o.tenant_id = p_tenant_id
    AND o.created_at >= p_start_date
    AND o.created_at <= p_end_date
    AND o.status != 'cancelled'
    AND o.payment_status IN ('paid', 'partial')
  GROUP BY c.name
  ORDER BY revenue DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_server_performance(p_tenant_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(server_id uuid, server_name text, orders bigint, revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    o.server_id AS server_id,
    COALESCE(MAX(au.full_name), o.server_id::TEXT)::TEXT AS server_name,
    COUNT(DISTINCT o.id) FILTER (WHERE p.status = 'completed')::BIGINT AS orders,
    SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END)::NUMERIC AS revenue
  FROM payments p
  JOIN orders o ON o.id = p.order_id AND o.tenant_id = p.tenant_id
  LEFT JOIN admin_users au ON au.id = o.server_id
  WHERE p.tenant_id = p_tenant_id
    AND p.created_at >= p_start_date
    AND p.created_at <= p_end_date
    AND o.server_id IS NOT NULL
  GROUP BY o.server_id
  ORDER BY orders DESC;
END;
$function$;
