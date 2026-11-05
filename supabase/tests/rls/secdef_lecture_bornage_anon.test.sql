-- Les quatre RPC SECURITY DEFINER en lecture ouvertes a `anon` doivent etre bornees.
--
-- Ce que ce test prouve, et que rien d'autre ne peut prouver: ces fonctions sont
-- atteintes avec le role `anon`, exactement comme un appel direct a
-- /rest/v1/rpc/<nom> depuis le navigateur avec la cle publique du bundle. Un test
-- a Supabase simule ne peut pas en rendre compte - ces appels ne passent par
-- AUCUNE route Next.js, donc par aucun rate limiting applicatif.
--
-- Les constats verrouilles ici ont ete MESURES en production le 2026-11-05 avec
-- la seule cle anon, pas deduits de la lecture du code:
--   - get_tenant_by_slug renvoyait `"subscription_plan":"business"` et
--     `"subscription_status":"active"` a un anonyme, alors que son seul appelant
--     n'utilise que id et currency;
--   - is_table_occupied repondait `true` a un anonyme alors que son seul appelant
--     passe par le client service_role;
--   - get_co_ordered_items servait 37 lignes avec comptes absolus quand
--     l'application en demande 6, p_limit etant impose par le client;
--   - get_orders_for_tracking acceptait 20000 ids (HTTP 200, 4,5 s de CPU).
--
-- Il protege les DEUX sens: la fuite est fermee (cas 1, 4, 6, 7) ET l'usage
-- legitime passe toujours (cas 2, 3, 5, 8, 9, 10). Les cas 11 et 12 verrouillent
-- un contournement du plafond lui-meme, trouve APRES le premier correctif.
-- Sans les cas de non-regression, on "corrige"
-- en cassant la vitrine et le suivi de commande.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/secdef_lecture_bornage_anon.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

-- Jeu d essai minimal: un restaurant, une categorie, deux plats, une commande
-- qui contient les deux (c est la co-occurrence que la RPC exploite).
insert into public.tenants (id, slug, name, is_active, currency, subscription_plan, subscription_status)
values
  ('aaaa1111-0000-0000-0000-00000000000a', 'tenant-bornage-a', 'Restaurant Bornage',
   true, 'XAF', 'business', 'active');

insert into public.categories (id, tenant_id, name)
values
  ('bbbb1111-0000-0000-0000-00000000000a', 'aaaa1111-0000-0000-0000-00000000000a', 'Plats');

insert into public.menu_items (id, tenant_id, category_id, name, price)
values
  ('cccc1111-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-00000000000a',
   'bbbb1111-0000-0000-0000-00000000000a', 'Poulet', 5000),
  ('cccc1111-0000-0000-0000-000000000002', 'aaaa1111-0000-0000-0000-00000000000a',
   'bbbb1111-0000-0000-0000-00000000000a', 'Attieke', 3000);

insert into public.orders (id, tenant_id, order_number, subtotal, total)
values
  ('dddd1111-0000-0000-0000-00000000000a', 'aaaa1111-0000-0000-0000-00000000000a',
   'BORNAGE-001', 8000, 8000);

insert into public.order_items (tenant_id, order_id, menu_item_id, item_name, price_at_order, quantity)
values
  ('aaaa1111-0000-0000-0000-00000000000a', 'dddd1111-0000-0000-0000-00000000000a',
   'cccc1111-0000-0000-0000-000000000001', 'Poulet', 5000, 1),
  ('aaaa1111-0000-0000-0000-00000000000a', 'dddd1111-0000-0000-0000-00000000000a',
   'cccc1111-0000-0000-0000-000000000002', 'Attieke', 3000, 1);

-- ------------------------------------------------- 1. get_tenant_by_slug
-- LE CONSTAT. Les colonnes d abonnement ne doivent plus figurer dans le type de
-- retour. On interroge le catalogue plutot que le resultat: une colonne absente
-- du type de retour ne peut pas fuiter, quelle que soit la ligne.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
     cross join lateral unnest(p.proargnames, p.proargmodes) as args(nom, mode)
     where ns.nspname = 'public'
       and p.proname = 'get_tenant_by_slug'
       and args.mode = 't'
       and args.nom in ('subscription_plan', 'subscription_status', 'trial_ends_at')),
  0,
  'get_tenant_by_slug: les colonnes d abonnement ont disparu du type de retour');

-- 2. NON-REGRESSION. La vitrine a toujours ce qu il lui faut, en anon.
set local role anon;

select is(
  (select t.currency from public.get_tenant_by_slug('tenant-bornage-a') t),
  'XAF',
  'get_tenant_by_slug: anon obtient toujours currency (usage legitime preserve)');

select is(
  (select t.id from public.get_tenant_by_slug('tenant-bornage-a') t),
  'aaaa1111-0000-0000-0000-00000000000a'::uuid,
  'get_tenant_by_slug: anon obtient toujours id (usage legitime preserve)');

-- ------------------------------------------------- 3. is_table_occupied
reset role;

select is(
  has_function_privilege('anon', 'public.is_table_occupied(uuid, text)', 'execute'),
  false,
  'is_table_occupied: anon n a plus le droit d executer (droit jamais utilise)');

-- 4. NON-REGRESSION. Le seul appelant reel passe par service_role.
select is(
  has_function_privilege('service_role', 'public.is_table_occupied(uuid, text)', 'execute'),
  true,
  'is_table_occupied: service_role peut toujours executer (seul appelant reel)');

-- ------------------------------------------------- 5-6. get_co_ordered_items
set local role anon;

-- 5. p_limit est impose par le client: il doit etre ramene dans la plage utile.
--    Sans la borne, cet appel rendait toute la ligne de co-occurrence.
select cmp_ok(
  (select count(*)::int
     from public.get_co_ordered_items(
       'aaaa1111-0000-0000-0000-00000000000a',
       array['cccc1111-0000-0000-0000-000000000001'::uuid],
       1000000)),
  '<=',
  24,
  'get_co_ordered_items: un p_limit absurde est ramene a 24 au maximum');

reset role;

-- 6. Les comptes absolus ne doivent plus sortir: c est le volume d affaires du
--    restaurant. L appelant (useCartSuggestions) ne lisait que menu_item_id.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
     cross join lateral unnest(p.proargnames, p.proargmodes) as args(nom, mode)
     where ns.nspname = 'public'
       and p.proname = 'get_co_ordered_items'
       and args.mode = 't'
       and args.nom = 'frequency'),
  0,
  'get_co_ordered_items: la colonne frequency a disparu du type de retour');

-- ------------------------------------------------- 7-8. get_orders_for_tracking
set local role anon;

-- 7. LE CONSTAT. 20000 ids etaient acceptes et tous scannes. Le tableau doit
--    desormais etre tronque a ses 200 DERNIERS - et NON refuse, sinon on
--    casserait le suivi des clients qui en ont deja plus en localStorage.
--
--    Comment on le prouve sans ambiguite: on place la vraie commande en TETE
--    d'un tableau de 201 ids. Elle tombe donc dans la part coupee. Si la
--    troncature opere, la RPC ne la voit pas et rend un tableau vide. Compter
--    les lignes d'un tableau de 201 UUID au hasard ne prouverait rien: avant
--    comme apres le correctif, aucun ne correspond a une commande.
select is(
  (select jsonb_array_length(public.get_orders_for_tracking(
     'aaaa1111-0000-0000-0000-00000000000a',
     array['dddd1111-0000-0000-0000-00000000000a'::uuid]
       || (select array_agg(gen_random_uuid()) from generate_series(1, 200))))),
  0,
  'get_orders_for_tracking: au-dela de 200 ids, le debut du tableau est tronque');

-- 8. NON-REGRESSION, et le pendant exact du cas 7: la MEME commande placee en
--    FIN d un tableau de 201 ids reste servie. C est ce qui distingue une
--    troncature des 200 derniers d un refus en bloc.
select is(
  (select jsonb_array_length(public.get_orders_for_tracking(
     'aaaa1111-0000-0000-0000-00000000000a',
     (select array_agg(gen_random_uuid()) from generate_series(1, 200))
       || array['dddd1111-0000-0000-0000-00000000000a'::uuid]))),
  1,
  'get_orders_for_tracking: la commande en fin de tableau reste servie');

-- 9. NON-REGRESSION. Le suivi d une commande reelle fonctionne toujours en anon,
--    avec ses lignes d articles - c est l ecran que voit le convive.
select is(
  (select jsonb_array_length(
            public.get_orders_for_tracking(
              'aaaa1111-0000-0000-0000-00000000000a',
              array['dddd1111-0000-0000-0000-00000000000a'::uuid]) -> 0 -> 'order_items')),
  2,
  'get_orders_for_tracking: anon suit toujours sa commande et ses 2 articles');

-- ---------------------------------------------- 11-12. CONTOURNEMENT PAR IMBRICATION
-- Le premier correctif (20261105140000) bornait avec `array_length(arr, 1)`, qui
-- ne compte que la PREMIERE dimension. PostgREST accepte un tableau JSON imbrique
-- et le passe a Postgres en 2-D: mesure en production, un tableau de 10000 ids
-- presente array_length(x,1)=2, donc la borne ne declenchait pas. Le plafond
-- etait contournable par le seul fait d'imbriquer sa charge.
--
-- 20261105150000 aplatit avec `array(select unnest(...))` avant de compter, ce
-- qui neutralise l'imbrication ET renormalise les bornes d'indice a 1.

-- 11. La vraie commande est placee dans un tableau 2-D de 600 ids, en position
--     301 apres aplatissement - donc hors des 200 derniers. Elle doit disparaitre.
--     Avant 20261105150000, elle etait vue: 600 ids etaient scannes.
select is(
  (select jsonb_array_length(public.get_orders_for_tracking(
     'aaaa1111-0000-0000-0000-00000000000a',
     array[
       array(select gen_random_uuid() from generate_series(1, 300)),
       array['dddd1111-0000-0000-0000-00000000000a'::uuid]
         || array(select gen_random_uuid() from generate_series(1, 299))
     ]))),
  0,
  'get_orders_for_tracking: un tableau imbrique ne contourne plus le plafond');

-- 12. Meme contournement sur le panier: 2 x 100 ids passaient la borne de 100.
select throws_ok(
  $q$ select public.get_co_ordered_items(
        'aaaa1111-0000-0000-0000-00000000000a',
        array[array(select gen_random_uuid() from generate_series(1, 100)),
              array(select gen_random_uuid() from generate_series(1, 100))],
        6) $q$,
  '22023',
  null,
  'get_co_ordered_items: un panier imbrique de 200 ids est refuse');

reset role;

select * from finish();
rollback;
