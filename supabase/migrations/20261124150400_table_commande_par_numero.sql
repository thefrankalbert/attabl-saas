-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B122 (Moyenne). La commande d'un QR de
-- table est rattachee a la bonne table.
--
-- CE QUI NE TENAIT PAS. `create_order_with_items` cherchait la table par
-- `table_number = p OR display_name = p` avec `LIMIT 1` sans ordre. Le nom
-- affiche n'a aucune unicite: une table renommee avec le numero d'une autre
-- ("TER-2" renommee "TER-1") faisait rattacher la commande du QR de la vraie
-- "TER-1" a la mauvaise table (notification "commande prete" au mauvais
-- serveur, attribution automatique de la mauvaise table en caisse).
--
-- LA CORRECTION.
-- 1. Recherche: le numero d'abord (`tables_tenant_table_number_key`, unique
--    par restaurant), le nom affiche seulement a defaut, ordre fixe.
-- 2. Ecriture: un declencheur sur `tables` refuse (23505) un `display_name`
--    egal au `table_number` d'une AUTRE table du meme restaurant, et, dans
--    l'autre sens (contre-audit 1), un `table_number` egal au `display_name`
--    d'une autre table. L'invariant "aucun nom egal au numero d'une autre
--    table" ne peut donc plus etre cree par aucune des deux colonnes. La lecture
--    du 2026-11-23 a compte 0 table dans ce cas en production: aucune ligne
--    existante n'est bloquee (le declencheur ne juge qu'a l'ecriture de ces
--    deux colonnes). `updateTableDisplayName` traduit le refus en message.
-- Corps de `create_order_with_items` recopie du texte STOCKE en production
-- (lu le 2026-11-24, `lot-b2b1/prod-fonctions.sql`); seul l'ORDER BY est
-- ajoute. Meme signature: proprietaire et droits gardes (EXECUTE a postgres
-- et service_role seulement), reposes a l'identique.
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne. Le code en ligne
-- renvoie un message generique sur le refus du declencheur (cas qui n'existe
-- pas aujourd'hui); le nouveau code le dit clairement.
--
-- ROLLBACK: rejouer le corps de prod-fonctions.sql, puis
--   DROP TRIGGER IF EXISTS trg_tables_nom_pas_numero_autre ON public.tables;
--   DROP FUNCTION IF EXISTS public.tables_nom_pas_numero_autre();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_order_with_items(p_tenant_id uuid, p_order_number text, p_total bigint, p_table_number text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_service_type text DEFAULT 'dine_in'::text, p_room_number text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text, p_subtotal bigint DEFAULT NULL::bigint, p_tax_amount bigint DEFAULT 0, p_service_charge_amount bigint DEFAULT 0, p_discount_amount bigint DEFAULT 0, p_tip_amount bigint DEFAULT 0, p_coupon_id uuid DEFAULT NULL::uuid, p_server_id uuid DEFAULT NULL::uuid, p_display_currency text DEFAULT NULL::text, p_preparation_zone text DEFAULT 'kitchen'::text, p_items jsonb DEFAULT '[]'::jsonb, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_total bigint;
  v_item jsonb;
  v_session_id uuid;
  v_table_id uuid;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id, order_number, total
      INTO v_order_id, v_order_number, v_total
      FROM orders
      WHERE tenant_id = p_tenant_id
        AND client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', v_order_number, 'total', v_total, 'deduplicated', true);
    END IF;
  END IF;

  IF p_table_number IS NOT NULL THEN
    SELECT t.id INTO v_table_id
      FROM tables t
      JOIN zones z ON z.id = t.zone_id
      JOIN venues v ON v.id = z.venue_id
      WHERE v.tenant_id = p_tenant_id
        AND (t.table_number = p_table_number OR t.display_name = p_table_number)
      -- B122: le NUMERO d'abord (unique par restaurant), le nom affiche
      -- seulement a defaut, dans un ordre fixe.
      ORDER BY (t.table_number = p_table_number) DESC, t.table_number, t.id
      LIMIT 1;
  END IF;

  IF p_table_number IS NOT NULL AND COALESCE(p_service_type, 'dine_in') = 'dine_in' THEN
    PERFORM pg_advisory_xact_lock(hashtext('table_session:' || p_tenant_id::text || ':' || p_table_number));
    SELECT id INTO v_session_id
      FROM table_sessions
      WHERE tenant_id = p_tenant_id AND table_number = p_table_number AND status = 'open'
      LIMIT 1;
    IF v_session_id IS NULL THEN
      INSERT INTO table_sessions (tenant_id, table_number) VALUES (p_tenant_id, p_table_number)
      RETURNING id INTO v_session_id;
    END IF;
  END IF;

  INSERT INTO orders (
    tenant_id, order_number, status, total, table_number, table_id,
    customer_name, customer_phone, notes,
    service_type, room_number, delivery_address,
    subtotal, tax_amount, service_charge_amount,
    discount_amount, tip_amount, payment_status,
    coupon_id, server_id, display_currency, preparation_zone,
    client_request_id, session_id
  ) VALUES (
    p_tenant_id, p_order_number, 'pending', p_total, p_table_number, v_table_id,
    p_customer_name, p_customer_phone, p_notes,
    p_service_type, p_room_number, p_delivery_address,
    COALESCE(p_subtotal, p_total), p_tax_amount, p_service_charge_amount,
    p_discount_amount, p_tip_amount, 'pending',
    p_coupon_id, p_server_id, p_display_currency, p_preparation_zone,
    p_client_request_id, v_session_id
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, menu_item_id, item_name, item_name_en,
      quantity, price_at_order, customer_notes,
      modifiers, course, item_status, preparation_zone,
      selected_option, selected_variant
    ) VALUES (
      v_order_id,
      (v_item->>'menu_item_id')::uuid,
      v_item->>'item_name',
      v_item->>'item_name_en',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'price_at_order')::bigint, 0),
      v_item->>'customer_notes',
      COALESCE(v_item->'modifiers', '[]'::jsonb),
      v_item->>'course',
      'pending',
      COALESCE(v_item->>'preparation_zone', 'kitchen'),
      v_item->'selected_option',
      v_item->'selected_variant'
    );
  END LOOP;

  RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', p_order_number, 'total', p_total);

EXCEPTION
  WHEN unique_violation THEN
    IF p_client_request_id IS NULL THEN RAISE; END IF;
    SELECT id, order_number, total
      INTO v_order_id, v_order_number, v_total
      FROM orders
      WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
    IF NOT FOUND THEN RAISE; END IF;
    RETURN jsonb_build_object('orderId', v_order_id, 'orderNumber', v_order_number, 'total', v_total, 'deduplicated', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order_with_items(uuid, text, bigint, text, text, text, text, text, text, text, bigint, bigint, bigint, bigint, bigint, uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(uuid, text, bigint, text, text, text, text, text, text, text, bigint, bigint, bigint, bigint, bigint, uuid, uuid, text, text, jsonb, uuid) TO service_role;

-- Garde d'ecriture, SECURITY INVOKER (regle du projet pour un declencheur de
-- garde). Qui peut ecrire une table du restaurant peut lire toutes ses tables
-- (politique de lecture des membres); service_role et postgres voient tout.
CREATE OR REPLACE FUNCTION public.tables_nom_pas_numero_autre()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tables t
     WHERE t.tenant_id = NEW.tenant_id
       AND t.id <> NEW.id
       AND t.table_number = NEW.display_name
  ) THEN
    RAISE EXCEPTION 'table_display_name_is_other_table_number: %', NEW.display_name
      USING ERRCODE = '23505';
  END IF;
  -- Sens inverse: un numero egal au nom d'une autre table.
  IF EXISTS (
    SELECT 1 FROM public.tables t
     WHERE t.tenant_id = NEW.tenant_id
       AND t.id <> NEW.id
       AND t.display_name = NEW.table_number
  ) THEN
    RAISE EXCEPTION 'table_number_is_other_table_display_name: %', NEW.table_number
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tables_nom_pas_numero_autre() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tables_nom_pas_numero_autre() TO service_role;

DROP TRIGGER IF EXISTS trg_tables_nom_pas_numero_autre ON public.tables;
CREATE TRIGGER trg_tables_nom_pas_numero_autre
  BEFORE INSERT OR UPDATE OF display_name, table_number, tenant_id ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.tables_nom_pas_numero_autre();

COMMIT;
