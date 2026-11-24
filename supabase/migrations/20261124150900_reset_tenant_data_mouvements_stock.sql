-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B76 (Moyenne). La remise a zero
-- "complete" (`reset_tenant_data`, type `all`) fonctionne.
--
-- CE QUI NE TENAIT PAS. Le type `all` supprimait dans `inventory_movements`,
-- table qui n'existe pas en production (`to_regclass` NULL, lu le
-- 2026-11-23): l'appel echouait toujours, rien n'etait remis a zero, et le
-- proprietaire recevait "Erreur lors de la reinitialisation des donnees".
--
-- LA CORRECTION. L'ecran promet "Supprime commandes, mouvements de stock et
-- compteurs de coupons" (`reset_all_description`): la ligne vise desormais
-- `stock_movements`, le registre des mouvements. Le stock courant des
-- ingredients n'est pas efface (rien ne le promet): pour que registre et stock
-- restent d'accord, une ligne `opening` par ingredient a stock non nul est
-- reecrite, si le restaurant a le module Stock (le verrou de plan
-- `enforce_stock_movement_entitlement` refuserait ces lignes sinon). Les types
-- `orders` et `statistics` sont inchanges. Corps recopie du texte STOCKE en
-- production (lu le 2026-11-24, `lot-b2b1/prod-fonctions.sql`). Droits
-- reposes a l'identique (EXECUTE a postgres et service_role seulement).
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne (meme signature, meme
-- forme de reponse; la route lit deja `movements_deleted`).
--
-- ROLLBACK: rejouer le corps de prod-fonctions.sql (qui echoue sur le type
-- `all`).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_tenant_data(p_tenant_id uuid, p_reset_type text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    orders_deleted int := 0;
    items_deleted int := 0;
    movements_deleted int := 0;
    coupons_reset int := 0;
  BEGIN
    IF p_tenant_id IS NULL THEN
      RAISE EXCEPTION 'p_tenant_id is required' USING ERRCODE = '22023';
    END IF;

    IF p_reset_type NOT IN ('orders', 'statistics', 'all') THEN
      RAISE EXCEPTION 'Invalid reset_type: %', p_reset_type USING ERRCODE = '22023';
    END IF;

    IF p_reset_type = 'orders' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;

    ELSIF p_reset_type = 'statistics' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
          AND o.status IN ('delivered', 'cancelled')
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id
          AND status IN ('delivered', 'cancelled') RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;

    ELSIF p_reset_type = 'all' THEN
      WITH del_items AS (
        DELETE FROM order_items oi USING orders o
        WHERE oi.order_id = o.id AND o.tenant_id = p_tenant_id
        RETURNING 1
      ) SELECT count(*) INTO items_deleted FROM del_items;
      WITH del_orders AS (
        DELETE FROM orders WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO orders_deleted FROM del_orders;
      -- B76: la table s'appelle stock_movements (inventory_movements n'existe
      -- pas: le type 'all' echouait toujours).
      WITH del_mov AS (
        DELETE FROM stock_movements WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO movements_deleted FROM del_mov;
      -- Le registre repart du stock actuel, qui n'est pas efface: une ligne
      -- d'ouverture par ingredient a stock non nul, pour que registre et stock
      -- concordent (verify_stock_ledger). Seulement si le restaurant a le
      -- module Stock: sans lui, le verrou de plan refuse ces lignes, et un
      -- reconcile_stock_ledger les ecrira le jour ou il le reprend.
      IF public.tenant_effective_plan(p_tenant_id) IN ('pro', 'business', 'enterprise') THEN
        INSERT INTO stock_movements (tenant_id, ingredient_id, movement_type, quantity, notes)
        SELECT i.tenant_id, i.id, 'opening', i.current_stock, 'Remise a zero: stock de depart'
          FROM ingredients i
         WHERE i.tenant_id = p_tenant_id
           AND i.current_stock <> 0;
      END IF;
      WITH upd_coupons AS (
        UPDATE coupons SET current_uses = 0 WHERE tenant_id = p_tenant_id RETURNING 1
      ) SELECT count(*) INTO coupons_reset FROM upd_coupons;
    END IF;

    RETURN json_build_object(
      'reset_type', p_reset_type,
      'orders_deleted', orders_deleted,
      'items_deleted', items_deleted,
      'movements_deleted', movements_deleted,
      'coupons_reset', coupons_reset
    );
  END;
  $function$;

REVOKE ALL ON FUNCTION public.reset_tenant_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_tenant_data(uuid, text) TO service_role;
