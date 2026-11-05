-- Correctif du bornage pose par 20261105140000: il se laissait contourner.
--
-- CE QUI N ALLAIT PAS. Les deux bornes utilisaient `array_length(arr, 1)`, qui ne
-- compte que la PREMIERE dimension. PostgREST accepte un tableau JSON imbrique et
-- le passe a Postgres comme un tableau 2-D. Mesure en production le 2026-11-05,
-- apres application de 20261105140000:
--
--   charge {"p_order_ids": [[5000 uuid], [5000 uuid]]} => HTTP 200
--   array_ndims            = 2
--   array_length(x, 1)     = 2       <- ce que la borne regardait
--   cardinality            = 10000   <- ce qui etait reellement scanne
--   la borne (> 200) ne declenchait donc PAS.
--
-- Le plafond etait donc contournable par un attaquant qui imbrique son tableau:
-- exactement l amplification que 20261105140000 pretendait fermer.
--
-- Second defaut, de correction: le decoupage `p_order_ids[(v_n - 199):v_n]`
-- suppose un tableau indexe a partir de 1. Un tableau de borne inferieure
-- differente (ex. `[5:10]`) rendait un decoupage faux, donc une liste vide et un
-- suivi de commande casse sans raison visible.
--
-- LA PARADE, pour les deux: APLATIR d abord avec `array(select unnest(...))`. On
-- obtient toujours un tableau 1-D indexe a partir de 1, et `cardinality` devient
-- le compte exact. Le decoupage redevient juste, et aucune dimension ne peut se
-- cacher.
--
-- Rollback: reappliquer 20261105140000.

-- ---------------------------------------------------------------------------
-- get_orders_for_tracking: aplatir, puis tronquer sur le compte REEL.
-- On TRONQUE toujours (et on ne refuse pas): voir 20261105140000 pour la raison.
-- ---------------------------------------------------------------------------
create or replace function public.get_orders_for_tracking(
  p_tenant_id uuid,
  p_order_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
            'image_url', mi.image_url
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
$function$;

alter function public.get_orders_for_tracking(uuid, uuid[]) owner to postgres;
revoke all on function public.get_orders_for_tracking(uuid, uuid[]) from public;
grant execute on function public.get_orders_for_tracking(uuid, uuid[]) to anon;
grant execute on function public.get_orders_for_tracking(uuid, uuid[]) to authenticated;
grant execute on function public.get_orders_for_tracking(uuid, uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- get_co_ordered_items: meme aplatissement. Ici on REFUSE au-dela de 100, car un
-- panier imbriqué n est pas un client legitime - le panier est deja plafonne a 50
-- articles par le schema Zod de la commande.
-- ---------------------------------------------------------------------------
create or replace function public.get_co_ordered_items(
  p_tenant_id uuid,
  p_cart_ids uuid[],
  p_limit integer default 6
)
returns table(menu_item_id uuid)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_limit integer;
  v_cart uuid[];
begin
  v_limit := least(greatest(coalesce(p_limit, 6), 1), 24);

  v_cart := array(select unnest(p_cart_ids));
  if coalesce(cardinality(v_cart), 0) > 100 then
    raise exception 'p_cart_ids trop long (max 100)' using errcode = '22023';
  end if;

  return query
  select oi2.menu_item_id
  from order_items oi1
  inner join order_items oi2 on oi1.order_id = oi2.order_id
  inner join orders o on oi1.order_id = o.id
  where oi1.menu_item_id = any(v_cart)
    and oi2.menu_item_id <> all(v_cart)
    and o.tenant_id = p_tenant_id
  group by oi2.menu_item_id
  order by count(*) desc, oi2.menu_item_id
  limit v_limit;
end;
$function$;

alter function public.get_co_ordered_items(uuid, uuid[], integer) owner to postgres;
revoke all on function public.get_co_ordered_items(uuid, uuid[], integer) from public;
grant execute on function public.get_co_ordered_items(uuid, uuid[], integer) to anon;
grant execute on function public.get_co_ordered_items(uuid, uuid[], integer) to authenticated;
grant execute on function public.get_co_ordered_items(uuid, uuid[], integer) to service_role;
