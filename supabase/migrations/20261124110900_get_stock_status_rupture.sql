-- ============================================================================
-- Audit B120 (Moyenne): `get_stock_status` signale enfin un stock nul ou
-- negatif sans seuil d'alerte.
--
-- CE QUI NE TENAIT PAS. `is_low = (current_stock <= min_stock_alert AND
-- min_stock_alert > 0)`: un ingredient a 0, ou en negatif, sans seuil d'alerte
-- (seuil 0 par defaut) sortait "OK" dans le rapport de stock, alors que
-- l'alerte (`notification.service.ts`) le tient pour en rupture.
--
-- LA CORRECTION. `is_low = (current_stock <= 0 OR (min_stock_alert > 0 AND
-- current_stock <= min_stock_alert))`.
--
-- Corps repris du texte STOCKE en production (lu le 2026-11-23, identique a
-- `20260623000000_secdef_cross_tenant_guard.sql`), seule l'expression `is_low`
-- change. Meme signature, meme type de retour, SECURITY DEFINER,
-- `search_path = public`, garde d'appartenance `assert_tenant_member`, memes
-- droits (EXECUTE a authenticated et service_role).
--
-- ORDRE DE DEPLOIEMENT: peut passer AVANT le code en ligne.
--
-- ROLLBACK: rejouer la definition de `20260623000000`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_stock_status(p_tenant_id uuid)
RETURNS TABLE (
  id uuid, name text, unit text, current_stock numeric,
  min_stock_alert numeric, cost_per_unit numeric, category text,
  is_active boolean, nb_items_using bigint, is_low boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
    i.cost_per_unit, i.category, i.is_active,
    COUNT(DISTINCT r.menu_item_id) AS nb_items_using,
    (i.current_stock <= 0
      OR (i.min_stock_alert > 0 AND i.current_stock <= i.min_stock_alert)) AS is_low
  FROM public.ingredients i
  LEFT JOIN public.recipes r ON r.ingredient_id = i.id AND r.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id AND i.is_active = true
  GROUP BY i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
           i.cost_per_unit, i.category, i.is_active
  ORDER BY i.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stock_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_status(uuid) TO authenticated, service_role;
