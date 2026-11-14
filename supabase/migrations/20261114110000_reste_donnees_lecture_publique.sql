-- Test d'intrusion du 2026-11-12, reste a faire : T-02, T-04, T-05.
--
-- T-02 (MOYEN) Tout compte connecte lisait l'etat d'abonnement, le telephone et
--      l'adresse de TOUS les restaurants actifs. Cause : la policy
--      "Public can read active tenants" n'avait pas de clause TO, donc elle
--      s'appliquait aussi au role `authenticated`, qui a des droits de colonne
--      bien plus larges que `anon` (20261109100356). Les colonnes sensibles
--      restent donc lisibles pour un restaurateur, mais pour les lignes de SES
--      restaurants seulement : la policy pour les membres ("Authenticated users
--      can read tenants they belong to") et celle du proprietaire de groupe
--      ("group_owner_can_read_tenants") existent deja et restent en place.
--      Cette migration limite la policy publique au role `anon` (dont les droits
--      de colonne sont deja ceux de la vitrine) et rend au super-administrateur
--      ce que la policy publique lui donnait (restaurants actifs).
--
-- T-04 (BAS)   La carte (plats, categories, menus, lieux, tables) d'un
--      restaurant supprime, suspendu ou ferme restait lisible avec la cle
--      publique. Les policies publiques ne filtrent que is_active / deleted_at
--      de la LIGNE, jamais l'etat du restaurant. Une policy RESTRICTIVE (elle
--      s'ajoute en ET aux policies existantes, sans avoir a les nommer) exige
--      desormais que le restaurant soit visible depuis la vitrine, ou que le
--      lecteur en soit membre / proprietaire de groupe / super-administrateur.
--      La regle de visibilite reproduit src/lib/billing/storefront-access.ts :
--      restaurant non supprime, non suspendu, ET (actif OU gele pour fin d'essai
--      depuis moins de 7 jours : la periode de lecture seule). La base est donc
--      aussi large ou un peu plus large que l'application, jamais plus etroite :
--      la grace de 7 jours n'est pas cassee. Les tables enfants (supplements,
--      options, variantes) heritent du filtre par leur sous-requete sur menu_items.
--
-- T-05 (BAS)   Les deux fonctions publiques d'occupation / de ventes avaient deja
--      ete traitees par 20261105140000 (is_table_occupied : droits anon et
--      authenticated retires ; get_co_ordered_items : plafond et colonne de
--      volume retires). L'audit avait lu schema.sql, un instantane plus ancien.
--      Reste ici : get_co_ordered_items repondait encore pour un restaurant ferme
--      ou supprime ; elle est bornee a la meme regle de visibilite.
--
-- Ordre de mise en production : le code (commit de cette PR) D'ABORD. Il remplace
-- deux lectures de la ligne `tenants` faites avec la session du visiteur
-- (page des commandes de la vitrine, manifeste PWA) par le cache service_role ;
-- sans lui, un visiteur connecte (autre restaurateur) verrait ces deux pages
-- casser des que la policy est resserree. Cette migration RETIRE un acces : elle
-- vient apres le deploiement du code.
--
-- Effet connu et accepte : l'abonnement temps reel a la ligne `tenants` d'un
-- restaurant dont on n'est pas membre ne livre plus d'evenement a un visiteur
-- CONNECTE (le visiteur anonyme, lui, continue de les recevoir). La vitrine se
-- met a jour au prochain chargement au lieu de a chaud.
--
-- Retour arriere :
--   drop policy if exists "Tenants visibles: super-administrateur" on public.tenants;
--   drop policy if exists "Public can read active tenants" on public.tenants;
--   create policy "Public can read active tenants" on public.tenants
--     for select using (is_active = true);
--   drop policy if exists "Catalogue: restaurant visible ou membre" on public.menu_items;
--   (idem sur categories, menus, venues, tables)
--   puis rejouer 20261105150000 pour get_co_ordered_items, et
--   drop function public.storefront_tenant_visible(uuid);
--   drop function public.viewer_owns_tenant_group(uuid);

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Regle de visibilite, en un seul endroit. SECURITY DEFINER: les colonnes
-- subscription_status, freeze_reason, trial_ends_at et suspended_at ne sont pas
-- lisibles par `anon`, or une policy s'evalue avec les droits du lecteur.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storefront_tenant_visible(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.deleted_at IS NULL
      AND t.suspended_at IS NULL
      AND (
        t.is_active = true
        OR (
          t.subscription_status = 'frozen'
          AND t.freeze_reason = 'trial_expired'
          AND t.trial_ends_at IS NOT NULL
          AND now() < t.trial_ends_at + interval '7 days'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.viewer_owns_tenant_group(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    JOIN public.restaurant_groups g ON g.id = t.group_id
    WHERE t.id = p_tenant_id
      AND g.owner_user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.storefront_tenant_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.viewer_owns_tenant_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_tenant_visible(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.viewer_owns_tenant_group(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- T-02 : la policy publique ne vaut plus que pour anon.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read active tenants" ON public.tenants;
CREATE POLICY "Public can read active tenants" ON public.tenants
  FOR SELECT TO anon USING (is_active = true);

-- Le super-administrateur lisait les restaurants actifs par la policy publique.
-- Meme perimetre, sans la porte ouverte aux autres comptes.
DROP POLICY IF EXISTS "Tenants visibles: super-administrateur" ON public.tenants;
CREATE POLICY "Tenants visibles: super-administrateur" ON public.tenants
  FOR SELECT TO authenticated USING (is_active = true AND (SELECT public.is_super_admin()));

-- ---------------------------------------------------------------------------
-- T-04 : la carte d'un restaurant non visible n'est plus lisible par le public.
-- RESTRICTIVE : s'ajoute en ET aux policies permissives deja posees, quel que
-- soit leur nom en production.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['menu_items', 'categories', 'menus', 'venues', 'tables']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Catalogue: restaurant visible ou membre" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Catalogue: restaurant visible ou membre" ON public.%I
         AS RESTRICTIVE FOR SELECT TO anon, authenticated
         USING (
           tenant_id = ANY ((SELECT public.get_my_tenant_ids_array()))
           OR (SELECT public.is_super_admin())
           OR public.storefront_tenant_visible(tenant_id)
           OR public.viewer_owns_tenant_group(tenant_id)
         )', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- T-05 : get_co_ordered_items ne repond plus pour un restaurant non visible.
-- Corps de 20261105150000 + une garde ; signature, droits et proprietaire
-- inchanges.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_co_ordered_items(
  p_tenant_id uuid,
  p_cart_ids uuid[],
  p_limit integer DEFAULT 6
)
RETURNS TABLE(menu_item_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_limit integer;
  v_cart uuid[];
begin
  if not public.storefront_tenant_visible(p_tenant_id) then
    return;
  end if;

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

COMMIT;

NOTIFY pgrst, 'reload schema';
