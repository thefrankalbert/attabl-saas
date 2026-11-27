-- Suivi de commande du convive: chaque ligne renvoie aussi ses supplements
-- (`modifiers`) et sa note (`customer_notes`, ou la creation ecrit la taille et
-- l'option choisies). Audit d'equipe du 2026-11-27, convive C15, #48, #49, #63:
-- le suivi, la confirmation et le recu affichaient "2 x Brochettes 12 000"
-- pour un total de 12 600 (supplement invisible), et "Commander a nouveau"
-- perdait taille et supplements.
--
-- Changement ADDITIF: deux cles de plus par ligne, rien d'autre ne bouge
-- (meme signature, memes droits, meme bornage des identifiants). Ces donnees
-- appartiennent a la commande que l'appelant suit deja (son identifiant est
-- requis); la note est celle que le convive a lui-meme ecrite.
--
-- RETOUR ARRIERE: rejouer la definition de supabase/schema.sql (snapshot
-- 20261124210700), sans les deux cles.

BEGIN;

CREATE OR REPLACE FUNCTION "public"."get_orders_for_tracking"("p_tenant_id" "uuid", "p_order_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_ids uuid[];
  v_n integer;
begin
  -- Aplatissement: neutralise un tableau imbriqué ET renormalise les bornes a 1.
  v_ids := array(select unnest(p_order_ids));
  v_n := coalesce(cardinality(v_ids), 0);

  -- Les 200 plus recentes: le client empile a la fin a chaque commande.
  if v_n > 200 then
    v_ids := v_ids[(v_n - 199):v_n];
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(o) order by o.created_at desc), '[]'::jsonb)
    from (
      select
        ord.id,
        ord.order_number,
        ord.table_number,
        ord.status,
        ord.total,
        ord.subtotal,
        ord.tip_amount,
        ord.discount_amount,
        ord.tax_amount,
        ord.service_charge_amount,
        ord.service_type,
        ord.created_at,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'item_name', oi.item_name,
            'item_name_en', oi.item_name_en,
            'quantity', oi.quantity,
            'price_at_order', oi.price_at_order,
            'menu_item_id', oi.menu_item_id,
            'image_url', mi.image_url,
            'modifiers', coalesce(oi.modifiers, '[]'::jsonb),
            'customer_notes', oi.customer_notes
          ))
          from order_items oi
          left join menu_items mi on mi.id = oi.menu_item_id
          where oi.order_id = ord.id
        ), '[]'::jsonb) as order_items
      from orders ord
      where ord.tenant_id = p_tenant_id
        and ord.id = any(v_ids)
    ) o
  );
end;
$$;

COMMIT;
