-- Destockage: on deduit ce qui est consomme, meme si un ingredient manque
-- (audit du 2026-11-10, C-048; decision du proprietaire du 2026-11-12).
--
-- POURQUOI. Si UN ingredient d'une fiche technique n'avait pas assez de stock,
-- destock_order levait INSUFFICIENT_STOCK et toute la deduction etait annulee:
-- la vente passait, mais AUCUN ingredient n'etait retire, meme ceux qui
-- suffisaient. Le stock restait faux jusqu'a une correction a la main.
--
-- MAINTENANT. Chaque ligne de la fiche est deduite. Un ingredient peut passer
-- sous zero: le chiffre negatif dit exactement ce qui manque, et chaque
-- mouvement reste au registre (current_stock == somme des mouvements). Le
-- controle de stock bas (checkAndNotifyLowStock, lance apres chaque
-- destockage) previent le restaurant, puisqu'un stock negatif est toujours
-- sous son seuil. Un ingredient disparu est ignore au lieu de tout bloquer.
--
-- Tout le reste est identique a la definition de production relue le
-- 2026-11-12 (verrou, idempotence, recalcul de la disponibilite apres la
-- boucle, SECURITY DEFINER, search_path).
--
-- Rollback: rejouer la definition precedente (supabase/schema.sql, fonction
-- destock_order), qui remet le refus INSUFFICIENT_STOCK.

CREATE OR REPLACE FUNCTION public.destock_order(p_order_id uuid, p_tenant_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT := 0;
  v_item RECORD;
  v_recipe RECORD;
  v_new_stock NUMERIC(10,3);
  v_required NUMERIC(10,3);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('destock_order:' || p_order_id::text));

  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_id = p_order_id
      AND movement_type = 'order_destock'
  ) THEN
    RETURN 0;
  END IF;

  FOR v_item IN
    SELECT oi.menu_item_id, oi.quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.order_id = p_order_id
      AND o.tenant_id = p_tenant_id
  LOOP
    FOR v_recipe IN
      SELECT r.ingredient_id, r.quantity_needed
      FROM public.recipes r
      WHERE r.menu_item_id = v_item.menu_item_id
        AND r.tenant_id = p_tenant_id
    LOOP
      v_required := v_recipe.quantity_needed * v_item.quantity;

      -- C-048 (decision du proprietaire du 2026-11-12): on deduit ce qui est
      -- consomme, meme si le stock passe sous zero. Le stock reste juste (le
      -- registre explique chaque gramme) et le controle de stock bas, lance
      -- juste apres par schedule-destock, previent le restaurant.
      UPDATE public.ingredients
      SET current_stock = current_stock - v_required
      WHERE id = v_recipe.ingredient_id
        AND tenant_id = p_tenant_id
      RETURNING current_stock INTO v_new_stock;

      -- Ingredient disparu depuis la fiche technique: rien a deduire, et
      -- surtout pas de blocage du reste de la commande.
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, created_by)
      VALUES (
        p_tenant_id, v_recipe.ingredient_id, 'order_destock',
        -v_required, p_order_id, p_created_by
      );

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  -- La disponibilite est recalculee APRES la boucle, jamais dedans.
  -- ORDRE DE VERROUS: tous les chemins stock prennent d'abord les lignes
  -- `ingredients`, puis `menu_items`. Appeler sync dans la boucle gardait un
  -- verrou sur `menu_items` pendant qu'on allait verrouiller l'ingredient
  -- suivant, ce qui fermait un cycle avec une reception de marchandise
  -- (`adjust_ingredient_stock_tx`, qui verrouille l'ingredient puis les plats):
  -- deadlock 40P01, et ce declencheur tourne sur le chemin chaud de la prise de
  -- commande. En sortant d'ici, l'ordre est le meme partout.
  -- (Reste inchange et hors sujet ici: deux destockages concurrents peuvent
  -- encore se croiser sur deux ingredients, la boucle de recette n'ayant pas
  -- d'ordre garanti.)
  FOR v_recipe IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS delta
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'order_destock'
    GROUP BY sm.ingredient_id
  LOOP
    SELECT current_stock INTO v_new_stock
    FROM public.ingredients
    WHERE id = v_recipe.ingredient_id AND tenant_id = p_tenant_id;
    -- delta est negatif: l'etat d'avant est `apres - delta`.
    PERFORM public.sync_menu_availability(
      p_tenant_id, v_recipe.ingredient_id, v_new_stock - v_recipe.delta, v_new_stock
    );
  END LOOP;

  RETURN v_count;
END;
$function$;
