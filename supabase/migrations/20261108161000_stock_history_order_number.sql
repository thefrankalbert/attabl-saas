-- Historique de stock: afficher LA COMMANDE qui a sorti les ingredients.
--
-- CE QUI NE MARCHAIT PAS: une ligne 'order_destock' portait l'ingredient, la
-- quantite et l'auteur, mais la commande d'origine n'etait qu'un uuid technique
-- (`reference_id`) jamais affiche, et `notes` reste NULL sur ce type de
-- mouvement. A l'ecran, le restaurateur lisait "Riz -0.400 / Commandes" sans
-- aucun moyen de savoir de QUELLE commande il s'agissait: impossible de
-- verifier une sortie suspecte, ni de rapprocher le stock du ticket.
--
-- `stock_movements.reference_id` n'a pas de cle etrangere (il designe une
-- commande, un inventaire physique, ...), donc PostgREST ne peut pas faire la
-- jointure cote client: elle se fait ici, dans la RPC qui alimente l'ecran.
--
-- Rollback: restaurer le corps precedent depuis
-- supabase/backups/prod-schema-20261108T135715Z.sql (meme signature, sans la
-- colonne order_number).

-- La signature change (une colonne de plus en retour), donc CREATE OR REPLACE
-- est impossible (42P13): il FAUT supprimer puis recreer. Consequence a ne pas
-- rater, verifiee sur la prod le 2026-11-08: ce projet porte
--   ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon
-- (pg_default_acl: anon=X pour postgres ET supabase_admin), donc une fonction
-- FRAICHEMENT creee recoit un EXECUTE EXPLICITE pour `anon` - et
-- `REVOKE ... FROM PUBLIC` ne retire PAS un droit accorde nommement a un role.
-- L'ACL vivante de cette fonction est aujourd'hui {postgres, authenticated,
-- service_role}: sans le REVOKE ... FROM anon ci-dessous, la recreation
-- rouvrirait a la cle anonyme une RPC qui lit stock_movements, ingredients,
-- suppliers et admin_users.full_name en SECURITY DEFINER (assert_tenant_member
-- la refuserait, mais la surface serait rouverte et contournerait le rate
-- limiting Next.js).
DROP FUNCTION IF EXISTS public.get_stock_movements_page(uuid, integer, integer);

CREATE FUNCTION public.get_stock_movements_page(
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
  ORDER BY sm.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

ALTER FUNCTION public.get_stock_movements_page(uuid, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_stock_movements_page(uuid, integer, integer)
  FROM PUBLIC, anon;
-- Exactement l'ACL mesuree avant la migration ({postgres, authenticated,
-- service_role}): l'ecran historique est lu par un membre authentifie du tenant
-- (assert_tenant_member tranche), et par les chemins service_role.
GRANT EXECUTE ON FUNCTION public.get_stock_movements_page(uuid, integer, integer)
  TO authenticated, service_role;
