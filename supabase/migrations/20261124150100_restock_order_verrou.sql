-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B123 (Moyenne). `restock_order` ne rend
-- plus le stock deux fois pour deux annulations simultanees.
--
-- CE QUI NE TENAIT PAS. La garde d'idempotence de `restock_order` n'est qu'un
-- `IF EXISTS (... 'order_restock' ...)` lu avant l'UPDATE, sans verrou: la
-- redefinition `20260629120000` avait retire le `pg_advisory_xact_lock` de
-- `20260629000200`. Deux annulations simultanees (double appui, deux postes)
-- lisaient toutes deux "pas encore rendu", et le stock revenait deux fois,
-- avec deux mouvements `order_restock` au registre.
--
-- LA CORRECTION. En tete du corps, le meme verrou de transaction par commande
-- que `destock_order` (`hashtext('restock_order:' || p_order_id)`). Le reste
-- du corps est recopie du texte STOCKE en production (lu le 2026-11-24,
-- `lot-b2b1/prod-fonctions.sql`, signature a trois parametres). La racine
-- applicative est corrigee dans le meme lot (B67, B68): l'action ne
-- programme plus le restockage que si SON annulation a touche la commande.
-- `CREATE OR REPLACE` garde le proprietaire et les droits (EXECUTE a postgres
-- et service_role seulement); ils sont reposes ci-dessous a l'identique.
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne (meme signature, meme
-- resultat pour un appel seul; seul l'appel concurrent attend).
--
-- ROLLBACK: rejouer le corps de prod-fonctions.sql sans la ligne
-- `PERFORM pg_advisory_xact_lock(...)`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restock_order(p_order_id uuid, p_tenant_id uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT := 0;
  v_mov RECORD;
  v_new_stock NUMERIC(10,3);
  -- Ingredients effectivement recredites par CET appel, pour ne recalculer la
  -- disponibilite qu'apres la boucle (voir la note d'ordre de verrous).
  v_ids uuid[] := '{}';
  v_deltas numeric[] := '{}';
  v_i INT;
BEGIN
  -- B123: verrou par commande, comme destock_order. Deux annulations
  -- simultanees lisaient toutes deux "pas encore de order_restock" avant que
  -- la premiere ne valide, et la seconde recreditait une deuxieme fois. Avec
  -- le verrou, la seconde attend la fin de la premiere puis voit ses lignes.
  PERFORM pg_advisory_xact_lock(hashtext('restock_order:' || p_order_id::text));

  FOR v_mov IN
    SELECT sm.ingredient_id, SUM(sm.quantity) AS net_destocked
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_order_id
      AND sm.tenant_id = p_tenant_id
      AND sm.movement_type = 'order_destock'
    GROUP BY sm.ingredient_id
    HAVING SUM(sm.quantity) < 0
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.stock_movements r
      WHERE r.reference_id = p_order_id
        AND r.tenant_id = p_tenant_id
        AND r.movement_type = 'order_restock'
        AND r.ingredient_id = v_mov.ingredient_id
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.ingredients
    SET current_stock = current_stock + ABS(v_mov.net_destocked)
    WHERE id = v_mov.ingredient_id
      AND tenant_id = p_tenant_id
    RETURNING current_stock INTO v_new_stock;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES (
      p_tenant_id, v_mov.ingredient_id, 'order_restock',
      ABS(v_mov.net_destocked), p_order_id, 'Annulation / remboursement commande', p_created_by
    );

    v_ids := v_ids || v_mov.ingredient_id;
    v_deltas := v_deltas || ABS(v_mov.net_destocked);
    v_count := v_count + 1;
  END LOOP;

  -- Meme raison que dans destock_order: `menu_items` apres `ingredients`,
  -- jamais entre deux. Les deltas sont accumules plutot que relus depuis le
  -- ledger, pour ne traiter QUE les ingredients recredites par cet appel (un
  -- restockage partiel anterieur ne doit pas etre rejoue comme une transition).
  FOR v_i IN 1 .. COALESCE(array_length(v_ids, 1), 0) LOOP
    SELECT current_stock INTO v_new_stock
    FROM public.ingredients
    WHERE id = v_ids[v_i] AND tenant_id = p_tenant_id;
    PERFORM public.sync_menu_availability(
      p_tenant_id, v_ids[v_i], v_new_stock - v_deltas[v_i], v_new_stock
    );
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.restock_order(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restock_order(uuid, uuid, uuid) TO service_role;
