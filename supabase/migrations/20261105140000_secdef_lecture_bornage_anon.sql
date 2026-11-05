-- Bornage des quatre fonctions SECURITY DEFINER en LECTURE ouvertes a `anon`.
--
-- POURQUOI. Ces quatre fonctions sont volontairement publiques: la vitrine et le
-- suivi de commande s'adressent a un convive anonyme. Mais "publique" ne veut pas
-- dire "sans bornes". Elles sont SECURITY DEFINER, donc elles contournent RLS, et
-- elles sont appelees par le NAVIGATEUR directement sur l'API REST Supabase: le
-- rate limiting des routes Next.js ne s'y applique donc PAS du tout.
--
-- Les quatre constats ci-dessous ont ete MESURES en production le 2026-11-05 avec
-- la seule cle anon presente dans le bundle JavaScript, pas deduits de la lecture.
--
-- 1. get_tenant_by_slug renvoyait subscription_plan, subscription_status et
--    trial_ends_at. Mesure sur un slug reel: `"subscription_plan":"business"`,
--    `"subscription_status":"active"`. Les slugs sont des sous-domaines publics,
--    donc n'importe qui pouvait les enumerer et dresser la liste des clients
--    d'ATTABL avec leur formule et la date de fin d'essai - une cible toute faite
--    pour un concurrent. Le SEUL appelant (api/coupons/validate) n'utilise que
--    `id` et `currency`: ces trois colonnes ne servaient a personne.
--
-- 2. is_table_occupied avait les droits `anon` et `authenticated`. Le seul appelant
--    (lib/cache.ts getTableOccupied) passe par le client service_role. Ces droits
--    n'ont jamais servi, et ils offraient a un anonyme un oracle d'occupation sur
--    les tables de n'importe quel restaurant.
--
-- 3. get_co_ordered_items acceptait un p_limit non borne. Mesure: l'application
--    demande 6 lignes, une requete forgee en a obtenu 37, avec les comptes
--    ABSOLUS. En iterant sur chaque plat du menu (dont les ids sont publics), on
--    reconstruit la matrice de ventes croisees et le volume de commandes du
--    restaurant. p_limit est desormais ramene dans 1..24, et la colonne
--    `frequency` disparait: l'appelant (useCartSuggestions) ne lisait que
--    `menu_item_id` et ignorait la frequence. Sans les comptes, un attaquant
--    n'apprend plus qu'un ordre, plus un volume d'affaires.
--
-- 4. get_orders_for_tracking acceptait un tableau non borne. Mesure: 20000 UUID
--    au hasard => HTTP 200 en 4,5 s de CPU Postgres pour une charge de 800 Ko,
--    repetable sans limite. Ce n'est pas une fuite (le filtre tenant_id tient, et
--    un UUID v4 ne se devine pas) mais une amplification de deni de service. Le
--    tableau est desormais tronque a ses 200 derniers ids - tronque et NON refuse,
--    pour ne pas casser le suivi des clients qui en ont deja plus en localStorage
--    avant que le code client borne ne soit deploye (voir le commentaire dans la
--    fonction).
--
-- Rollback: reappliquer 20260411000000_co_ordered_items_rpc.sql,
-- 20260330000000_tighten_tenants_rls.sql, 20260711150000_is_table_occupied.sql et
-- 20260623100000_order_tracking_scoped_anon_read.sql.

-- ---------------------------------------------------------------------------
-- 1. get_tenant_by_slug: retrait des trois colonnes d'abonnement.
--    Changer un RETURNS TABLE impose DROP + CREATE. Verifie avant: aucune policy
--    ni aucune autre fonction ne depend de celle-ci.
-- ---------------------------------------------------------------------------
drop function if exists public.get_tenant_by_slug(text);

create function public.get_tenant_by_slug(p_slug text)
returns table(
  id uuid,
  name text,
  slug text,
  logo_url text,
  currency text,
  tax_rate numeric,
  service_charge_rate numeric,
  enable_tax boolean,
  enable_service_charge boolean,
  establishment_type text,
  is_active boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.name, t.slug, t.logo_url, t.currency, t.tax_rate,
         t.service_charge_rate, t.enable_tax, t.enable_service_charge,
         t.establishment_type, t.is_active
  from tenants t
  where t.slug = p_slug
    and t.is_active = true
  limit 1;
$$;

alter function public.get_tenant_by_slug(text) owner to postgres;
revoke all on function public.get_tenant_by_slug(text) from public;
grant execute on function public.get_tenant_by_slug(text) to anon;
grant execute on function public.get_tenant_by_slug(text) to authenticated;
grant execute on function public.get_tenant_by_slug(text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. is_table_occupied: retrait des droits qui ne servaient a personne.
--    Le corps est inchange; seuls les droits bougent.
-- ---------------------------------------------------------------------------
revoke all on function public.is_table_occupied(uuid, text) from anon;
revoke all on function public.is_table_occupied(uuid, text) from authenticated;
grant execute on function public.is_table_occupied(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. get_co_ordered_items: p_limit borne, colonne frequency retiree.
-- ---------------------------------------------------------------------------
drop function if exists public.get_co_ordered_items(uuid, uuid[], integer);

create function public.get_co_ordered_items(
  p_tenant_id uuid,
  p_cart_ids uuid[],
  p_limit integer default 6
)
returns table(menu_item_id uuid)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_limit integer;
begin
  -- p_limit vient du client: on le ramene dans une plage utile a l'interface.
  -- 24 couvre tres largement les 6 suggestions affichees.
  v_limit := least(greatest(coalesce(p_limit, 6), 1), 24);

  -- Un panier n'a pas 500 lignes: borner evite une jointure forgee.
  if coalesce(array_length(p_cart_ids, 1), 0) > 100 then
    raise exception 'p_cart_ids trop long (max 100)' using errcode = '22023';
  end if;

  return query
  select oi2.menu_item_id
  from order_items oi1
  inner join order_items oi2 on oi1.order_id = oi2.order_id
  inner join orders o on oi1.order_id = o.id
  where oi1.menu_item_id = any(p_cart_ids)
    and oi2.menu_item_id <> all(p_cart_ids)
    and o.tenant_id = p_tenant_id
  group by oi2.menu_item_id
  order by count(*) desc, oi2.menu_item_id
  limit v_limit;
end;
$$;

alter function public.get_co_ordered_items(uuid, uuid[], integer) owner to postgres;
revoke all on function public.get_co_ordered_items(uuid, uuid[], integer) from public;
grant execute on function public.get_co_ordered_items(uuid, uuid[], integer) to anon;
grant execute on function public.get_co_ordered_items(uuid, uuid[], integer) to authenticated;
grant execute on function public.get_co_ordered_items(uuid, uuid[], integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. get_orders_for_tracking: tableau plafonne. Signature INCHANGEE, donc aucun
--    appelant a modifier.
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
as $$
declare
  v_ids uuid[];
  v_n integer;
begin
  -- On TRONQUE au lieu de refuser, et c'est deliberé. Refuser casserait le suivi
  -- de commande des clients qui ont deja plus de 200 ids en localStorage (cette
  -- liste n'a jamais ete elaguee) tant que le code client borne n'est pas
  -- deploye. Tronquer coupe l'amplification tout de suite, sans dependre d'un
  -- ordre entre la migration et le deploiement.
  --
  -- On garde les 200 DERNIERES: le client empile a la fin a chaque commande, donc
  -- ce sont les plus recentes - les seules qu'un convive consulte.
  v_n := coalesce(array_length(p_order_ids, 1), 0);
  if v_n > 200 then
    v_ids := p_order_ids[(v_n - 199):v_n];
  else
    v_ids := p_order_ids;
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
$$;

alter function public.get_orders_for_tracking(uuid, uuid[]) owner to postgres;
revoke all on function public.get_orders_for_tracking(uuid, uuid[]) from public;
grant execute on function public.get_orders_for_tracking(uuid, uuid[]) to anon;
grant execute on function public.get_orders_for_tracking(uuid, uuid[]) to authenticated;
grant execute on function public.get_orders_for_tracking(uuid, uuid[]) to service_role;
