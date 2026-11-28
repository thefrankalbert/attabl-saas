-- Garde du prix : sans `menu.price`, on modifie la carte mais pas un prix.
--
-- POURQUOI CE TEST EXISTE. Le lot 1 des roles separe "modifier la carte" et
-- "modifier les prix". Or la politique UPDATE de `menu_items` laisse ecrire
-- toutes les colonnes a qui a `menu.edit` : sans garde PAR COLONNE, retirer
-- `menu.price` a un chef ne ferait que masquer un champ a l'ecran, et il
-- changerait le prix en appelant la base avec son propre jeton. Quatre
-- surfaces portent un prix : menu_items.price et .prices,
-- item_price_variants, item_modifiers.
--
-- Le declencheur est SECURITY INVOKER : il lit `current_user`. Le test verifie
-- aussi `prosecdef = false`, car en DEFINER la garde ne se declencherait jamais
-- (lecon du depot) et tous les refus ci-dessous passeraient au vert a tort.
--
-- TEMOIN. La meme requete, deux chefs : celui a qui le proprietaire a retire
-- `menu.price` est refuse, le chef par defaut passe.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

-- 1 chef sans menu.price, 2 chef par defaut.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a9000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'prix' || g || '@test.local', 'x', now(), now()
from generate_series(1, 2) g;
insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('a9000000-0000-4000-8000-000000000001', 'tenant-prix', 'Tenant Prix', true, 'business', 'active');
insert into public.admin_users (tenant_id, user_id, email, postes, permission_overrides, is_active) values
  ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000101', 'prix1@test.local', '{chef}', '{"menu.price": false}', true),
  ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000102', 'prix2@test.local', '{chef}', null, true);

insert into public.categories (id, tenant_id, name)
values ('a9000000-0000-4000-8000-000000000201', 'a9000000-0000-4000-8000-000000000001', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price, description)
values ('a9000000-0000-4000-8000-000000000202', 'a9000000-0000-4000-8000-000000000001',
        'a9000000-0000-4000-8000-000000000201', 'Riz gras', 2500, 'origine');
insert into public.item_modifiers (id, tenant_id, menu_item_id, name, price)
values ('a9000000-0000-4000-8000-000000000203', 'a9000000-0000-4000-8000-000000000001',
        'a9000000-0000-4000-8000-000000000202', 'Piment', 100);

select is((select p.prosecdef from pg_proc p where p.oid = 'public.garder_prix_carte()'::regprocedure), false,
  'garder_prix_carte est SECURITY INVOKER (en DEFINER elle ne se declencherait jamais)');

set local role authenticated;

-- ===========================================================================
-- Chef a qui le proprietaire a retire menu.price
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000101"}';

update public.menu_items set description = 'par le chef sans prix', name = 'Riz au gras'
 where id = 'a9000000-0000-4000-8000-000000000202';
select is((select description from public.menu_items where id = 'a9000000-0000-4000-8000-000000000202'),
  'par le chef sans prix', 'sans menu.price: modifier la description et le nom d un plat PASSE');
select lives_ok(
  $$update public.menu_items set price = 2500 where id = 'a9000000-0000-4000-8000-000000000202'$$,
  'sans menu.price: reecrire le MEME prix passe (un formulaire renvoie toutes les colonnes)');
select throws_ok(
  $$update public.menu_items set price = 3000 where id = 'a9000000-0000-4000-8000-000000000202'$$,
  '42501', 'changing a price requires the menu.price permission', 'sans menu.price: changer `price` est REFUSE');
select throws_ok(
  $$update public.menu_items set prices = '{"XOF": 3000}'::jsonb where id = 'a9000000-0000-4000-8000-000000000202'$$,
  '42501', 'changing a price requires the menu.price permission', 'sans menu.price: changer `prices` est REFUSE');
select throws_ok(
  $$update public.menu_items set description = 'les deux', price = 1 where id = 'a9000000-0000-4000-8000-000000000202'$$,
  '42501', 'changing a price requires the menu.price permission',
  'sans menu.price: un UPDATE qui melange description et prix est refuse en entier');
select throws_ok(
  $$insert into public.menu_items (tenant_id, category_id, name, price)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000201', 'Nouveau', 1000)$$,
  '42501', null, 'sans menu.price: creer un plat est REFUSE (creer un plat, c est fixer son prix)');
select throws_ok(
  $$insert into public.item_price_variants (tenant_id, menu_item_id, variant_name_fr, price)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000202', 'Grand', 3500)$$,
  '42501', null, 'sans menu.price: creer une variante de prix est REFUSE');
select throws_ok(
  $$insert into public.item_modifiers (tenant_id, menu_item_id, name, price)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000202', 'Fromage', 500)$$,
  '42501', 'changing a price requires the menu.price permission', 'sans menu.price: creer un supplement PAYANT est REFUSE');
select throws_ok(
  $$insert into public.item_modifiers (tenant_id, menu_item_id, name, price, prices)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000202', 'Sauce', 0, '{"XOF": 200}')$$,
  '42501', 'changing a price requires the menu.price permission',
  'sans menu.price: un supplement dont le prix est dans `prices` est REFUSE aussi');
select lives_ok(
  $$insert into public.item_modifiers (tenant_id, menu_item_id, name, price)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000202', 'Sans oignon', 0)$$,
  'sans menu.price: creer un supplement GRATUIT passe (menu.edit suffit)');
select throws_ok(
  $$update public.item_modifiers set price = 900 where id = 'a9000000-0000-4000-8000-000000000203'$$,
  '42501', 'changing a price requires the menu.price permission', 'sans menu.price: changer le prix d un supplement est REFUSE');
select lives_ok(
  $$update public.item_modifiers set name = 'Piment fort' where id = 'a9000000-0000-4000-8000-000000000203'$$,
  'sans menu.price: renommer un supplement passe');

reset role;
select is((select price::int || '/' || coalesce(prices::text, 'null') from public.menu_items
            where id = 'a9000000-0000-4000-8000-000000000202'), '2500/null',
  'sans menu.price: apres toutes les tentatives, le prix du plat est intact');
select is((select price::int from public.item_modifiers where id = 'a9000000-0000-4000-8000-000000000203'), 100,
  'sans menu.price: le prix du supplement est intact');
select is((select count(*)::int from public.item_price_variants
            where tenant_id = 'a9000000-0000-4000-8000-000000000001'), 0,
  'sans menu.price: aucune variante de prix n a ete creee');

-- ===========================================================================
-- Chef par defaut : les memes requetes passent
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000102"}';
select lives_ok(
  $$update public.menu_items set price = 3000, prices = '{"XOF": 3000}'::jsonb
     where id = 'a9000000-0000-4000-8000-000000000202'$$,
  'temoin: un chef par defaut change `price` et `prices`');
select lives_ok(
  $$insert into public.menu_items (tenant_id, category_id, name, price)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000201', 'Nouveau', 1000)$$,
  'temoin: un chef par defaut cree un plat');
select lives_ok(
  $$insert into public.item_price_variants (tenant_id, menu_item_id, variant_name_fr, price)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000202', 'Grand', 3500)$$,
  'temoin: un chef par defaut cree une variante de prix');
select lives_ok(
  $$insert into public.item_modifiers (tenant_id, menu_item_id, name, price)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000202', 'Fromage', 500)$$,
  'temoin: un chef par defaut cree un supplement payant');
select lives_ok(
  $$update public.item_modifiers set price = 900 where id = 'a9000000-0000-4000-8000-000000000203'$$,
  'temoin: un chef par defaut change le prix d un supplement');
reset role;
select is((select price::int from public.menu_items where id = 'a9000000-0000-4000-8000-000000000202'), 3000,
  'temoin: le prix du plat a bien change (la garde ne bloque pas tout)');

-- ===========================================================================
-- service_role : hors de la garde (imports, taches planifiees)
-- ===========================================================================
set local role service_role;
select lives_ok(
  $$update public.menu_items set price = 4000 where id = 'a9000000-0000-4000-8000-000000000202'$$,
  'service_role: change un prix sans ligne de membre');
select lives_ok(
  $$insert into public.item_modifiers (tenant_id, menu_item_id, name, price)
    values ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000202', 'Service', 700)$$,
  'service_role: cree un supplement payant');
reset role;

select * from finish();
rollback;
