-- Historique de stock: un tri qui ne change pas d'une page a l'autre.
--
-- CE QUI NE MARCHAIT PAS: la RPC triait par `created_at DESC` seul. Or toutes les
-- lignes de destockage d'une meme commande portent EXACTEMENT le meme horodatage
-- (une transaction, `DEFAULT now()`), et l'ecran pagine par OFFSET par pages de
-- 200. Entre deux pages, Postgres est libre d'ordonner differemment les lignes a
-- egalite: un mouvement s'affichait deux fois et un autre jamais. Sur la piste
-- qui sert a reperer une sortie suspecte, une ligne qui disparait est un defaut
-- de fond, pas d'affichage.
--
-- Mesure (Postgres 17 local, 600 lignes par groupes de 7 au meme horodatage,
-- 3 pages de 200, plan par tri): 599 lignes distinctes sur 600. Avec le
-- departage par `id`: 600 sur 600.
--
-- La signature ne change pas: CREATE OR REPLACE conserve le proprietaire et
-- l'ACL posee par 20261108161000 ({postgres, authenticated, service_role}).
--
-- Rollback: rejouer le corps de 20261108161000_stock_history_order_number.sql.


CREATE OR REPLACE FUNCTION public.get_stock_movements_page(
  p_tenant_id uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid, tenant_id uuid, ingredient_id uuid, movement_type text, quantity numeric,
  reference_id uuid, notes text, reason_code text, created_by uuid, supplier_id uuid,
  created_at timestamp with time zone, ingredient_name text, ingredient_unit text,
  supplier_name text, author_name text, order_number text, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.id, sm.tenant_id, sm.ingredient_id, sm.movement_type, sm.quantity,
    sm.reference_id, sm.notes, sm.reason_code, sm.created_by, sm.supplier_id, sm.created_at,
    (SELECT i.name FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_name,
    (SELECT i.unit FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_unit,
    (SELECT s.name FROM public.suppliers s WHERE s.id = sm.supplier_id) AS supplier_name,
    (SELECT au.full_name FROM public.admin_users au
       WHERE au.user_id = sm.created_by AND au.tenant_id = sm.tenant_id
       LIMIT 1) AS author_name,
    -- Tenant-scope la jointure: reference_id seul pourrait designer la commande
    -- d'un autre restaurant si un uuid etait devine.
    CASE WHEN sm.movement_type IN ('order_destock', 'order_restock') THEN
      (SELECT o.order_number FROM public.orders o
         WHERE o.id = sm.reference_id AND o.tenant_id = sm.tenant_id)
    END AS order_number,
    COUNT(*) OVER() AS total_count
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
  ORDER BY sm.created_at DESC, sm.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
