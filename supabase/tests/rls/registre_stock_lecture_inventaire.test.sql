-- Module de stock, verification de mise en production du 2026-11-24
-- (rapport ui-stock.md, constats 2, 5 et 6).
--
-- A (20261124210100): `ingredients.current_stock` ne change que par les
--   fonctions du registre, et `stock_movements` ne recoit d'INSERT que par
--   elles. Gerant et proprietaire sont refuses en ecriture directe; les
--   fonctions (reception, perte, vente, inventaire) passent toujours.
-- B (20261124210200): la lecture directe de `ingredients`, `stock_movements`,
--   `suppliers`, `recipes`, `stock_counts` et `stock_count_lines` exige
--   `inventory.view` (ou `inventory.edit`), comme les pages: serveur et
--   caissier lisent 0 ligne, chef, gerant et proprietaire lisent tout, un
--   serveur a qui le proprietaire a delegue `inventory.view` lit.
-- C (20261124210300): valider un inventaire applique l'ecart affiche
--   (compte - theorique fige) au stock courant. Scenario chiffre: stock 10,
--   ouverture, vente de 2 plats (stock 8), comptage saisi a 9, validation:
--   ecart -1, mouvement -1, stock final 7 (l'ancienne regle donnait 9 et +1).
--
-- Chaque refus a son temoin positif sur la meme table ou la meme fonction:
-- sans les migrations, les assertions de refus et le scenario C echouent.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(35);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f5000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-rs@test.local', 'x', now(), now()),
  ('f5000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerant-rs@test.local', 'x', now(), now()),
  ('f5000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caissier-rs@test.local', 'x', now(), now()),
  ('f5000000-0000-4000-8000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur-rs@test.local', 'x', now(), now()),
  ('f5000000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chef-rs@test.local', 'x', now(), now()),
  ('f5000000-0000-4000-8000-0000000000a6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur-delegue-rs@test.local', 'x', now(), now()),
  ('f5000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-b-rs@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('f5000000-0000-4000-8000-00000000000a', 'rs-a', 'RS A', true, 'business', 'active'),
       ('f5000000-0000-4000-8000-00000000000b', 'rs-b', 'RS B', true, 'business', 'active');

insert into public.admin_users (tenant_id, user_id, email, role, is_active, permission_overrides)
values
  ('f5000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-0000000000a1', 'proprio-rs@test.local', 'owner', true, null),
  ('f5000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-0000000000a2', 'gerant-rs@test.local', 'manager', true, null),
  ('f5000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-0000000000a3', 'caissier-rs@test.local', 'cashier', true, null),
  ('f5000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-0000000000a4', 'serveur-rs@test.local', 'waiter', true, null),
  ('f5000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-0000000000a5', 'chef-rs@test.local', 'chef', true, null),
  ('f5000000-0000-4000-8000-00000000000a', 'f5000000-0000-4000-8000-0000000000a6', 'serveur-delegue-rs@test.local', 'waiter', true, '{"inventory.view": true}'::jsonb),
  ('f5000000-0000-4000-8000-00000000000b', 'f5000000-0000-4000-8000-0000000000b1', 'proprio-b-rs@test.local', 'owner', true, null);

-- Donnees du restaurant A, ecrites par le proprietaire de la base (hors RLS).
-- 101 sert a A, 102 et 103 au scenario C, 104 au temoin "sans vente".
insert into public.ingredients (id, tenant_id, name, unit, current_stock) values
  ('f5100000-0000-4000-8000-000000000101', 'f5000000-0000-4000-8000-00000000000a', 'Riz', 'kg', 10),
  ('f5100000-0000-4000-8000-000000000102', 'f5000000-0000-4000-8000-00000000000a', 'Farine', 'kg', 10),
  ('f5100000-0000-4000-8000-000000000104', 'f5000000-0000-4000-8000-00000000000a', 'Huile', 'L', 6);
insert into public.stock_movements (tenant_id, ingredient_id, movement_type, quantity) values
  ('f5000000-0000-4000-8000-00000000000a', 'f5100000-0000-4000-8000-000000000101', 'opening', 10),
  ('f5000000-0000-4000-8000-00000000000a', 'f5100000-0000-4000-8000-000000000102', 'opening', 10),
  ('f5000000-0000-4000-8000-00000000000a', 'f5100000-0000-4000-8000-000000000104', 'opening', 6);
insert into public.suppliers (tenant_id, name, phone) values
  ('f5000000-0000-4000-8000-00000000000a', 'Grossiste RS', '0100000000');
insert into public.categories (id, tenant_id, name) values
  ('f5200000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-00000000000a', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price) values
  ('f5300000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-00000000000a',
   'f5200000-0000-4000-8000-000000000001', 'Beignet', 500);
insert into public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed) values
  ('f5000000-0000-4000-8000-00000000000a', 'f5300000-0000-4000-8000-000000000001',
   'f5100000-0000-4000-8000-000000000102', 1);
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, status, payment_status)
values ('f5400000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-00000000000a',
        'takeaway', 'RS-01', 1000, 1000, 'pending', 'pending');
insert into public.order_items (order_id, menu_item_id, quantity, price_at_order, item_name, tenant_id)
values ('f5400000-0000-4000-8000-000000000001', 'f5300000-0000-4000-8000-000000000001', 2, 500,
        'Beignet', 'f5000000-0000-4000-8000-00000000000a');

-- Nombre de lignes du restaurant A visibles par le role courant.
create function public.test_rs_lire(p_table text) returns int
language plpgsql security invoker as $$
declare n int;
begin
  execute format('select count(*) from public.%I where tenant_id = %L', p_table,
                 'f5000000-0000-4000-8000-00000000000a') into n;
  return n;
end;
$$;
grant execute on function public.test_rs_lire(text) to authenticated, anon;

-- ===========================================================================
-- A. Registre de stock: pas d'ecriture directe
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

select throws_ok(
  $$update public.ingredients set current_stock = 777 where id = 'f5100000-0000-4000-8000-000000000101'$$,
  '42501', null, 'A gerant: modifier current_stock en direct est refuse');
select throws_ok(
  $$insert into public.stock_movements (tenant_id, ingredient_id, movement_type, quantity)
    values ('f5000000-0000-4000-8000-00000000000a', 'f5100000-0000-4000-8000-000000000101', 'manual_add', 5)$$,
  '42501', null, 'A gerant: fabriquer un mouvement en direct est refuse');
select throws_ok(
  $$insert into public.ingredients (tenant_id, name, unit, current_stock)
    values ('f5000000-0000-4000-8000-00000000000a', 'Sucre pirate', 'kg', 50)$$,
  '42501', null, 'A gerant: creer un produit avec du stock en direct est refuse');
select lives_ok(
  $$insert into public.ingredients (tenant_id, name, unit, current_stock)
    values ('f5000000-0000-4000-8000-00000000000a', 'Sucre', 'kg', 0)$$,
  'A temoin: creer un produit a 0 (forme de createIngredient) passe');
select lives_ok(
  $$update public.ingredients set min_stock_alert = 2, cost_per_unit = 900
    where id = 'f5100000-0000-4000-8000-000000000101'$$,
  'A temoin: modifier les autres colonnes du produit passe');
select lives_ok(
  $$select public.adjust_ingredient_stock_tx('f5000000-0000-4000-8000-00000000000a',
    'f5100000-0000-4000-8000-000000000101', 5, 'manual_add')$$,
  'A temoin: la reception par la fonction du registre passe');
select lives_ok(
  $$select public.record_loss_tx('f5000000-0000-4000-8000-00000000000a',
    'f5100000-0000-4000-8000-000000000101', 1, 'breakage')$$,
  'A temoin: la perte par la fonction du registre passe');
select is((select current_stock from public.ingredients where id = 'f5100000-0000-4000-8000-000000000101'),
  14.000::numeric, 'A: le stock n a bouge que par le registre (10 + 5 - 1)');

set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok(
  $$update public.ingredients set current_stock = 0 where id = 'f5100000-0000-4000-8000-000000000101'$$,
  '42501', null, 'A proprietaire: modifier current_stock en direct est refuse');
select throws_ok(
  $$insert into public.stock_movements (tenant_id, ingredient_id, movement_type, quantity)
    values ('f5000000-0000-4000-8000-00000000000a', 'f5100000-0000-4000-8000-000000000101', 'adjustment', -14)$$,
  '42501', null, 'A proprietaire: fabriquer un mouvement en direct est refuse');
select lives_ok(
  $$select public.set_opening_stock('f5000000-0000-4000-8000-00000000000a',
    'f5100000-0000-4000-8000-000000000101', 14)$$,
  'A temoin: le stock d ouverture par la fonction du registre passe');
reset role;

select is(
  (select i.current_stock - coalesce(sum(m.quantity), 0) from public.ingredients i
     left join public.stock_movements m on m.ingredient_id = i.id
    where i.id = 'f5100000-0000-4000-8000-000000000101' group by i.current_stock),
  0.000::numeric, 'A: stock = somme des mouvements (aucun ecart au registre)');
select ok(not has_table_privilege('authenticated', 'public.stock_movements', 'INSERT')
  and not has_table_privilege('authenticated', 'public.stock_movements', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.stock_movements', 'DELETE')
  and not has_table_privilege('authenticated', 'public.stock_movements', 'TRUNCATE')
  and has_table_privilege('authenticated', 'public.stock_movements', 'SELECT'),
  'A: stock_movements en lecture seule pour authenticated');
select is((select prosecdef from pg_proc where proname = 'registre_stock_garde_ingredients'),
  false, 'A: la garde est SECURITY INVOKER (current_user reel)');

-- ===========================================================================
-- B. Lecture directe: la regle des pages (inventory.view)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select is(public.test_rs_lire('ingredients'), 0, 'B serveur: 0 produit');
select is(public.test_rs_lire('stock_movements'), 0, 'B serveur: 0 mouvement');
select is(public.test_rs_lire('suppliers'), 0, 'B serveur: 0 fournisseur');
select is(public.test_rs_lire('recipes'), 0, 'B serveur: 0 fiche technique');

set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select is(public.test_rs_lire('ingredients'), 0, 'B caissier: 0 produit');
select is(public.test_rs_lire('stock_movements'), 0, 'B caissier: 0 mouvement');
select is(public.test_rs_lire('suppliers'), 0, 'B caissier: 0 fournisseur');

set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a5","role":"authenticated"}';
select is(public.test_rs_lire('ingredients'), 4, 'B temoin chef (inventory.view par defaut): 4 produits');
select is(public.test_rs_lire('suppliers'), 1, 'B temoin chef: le fournisseur');
select is(public.test_rs_lire('recipes'), 1, 'B temoin chef: la fiche technique');

set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select ok(public.test_rs_lire('stock_movements') >= 3, 'B temoin gerant: lit les mouvements');

set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a6","role":"authenticated"}';
select is(public.test_rs_lire('ingredients'), 4, 'B temoin: serveur avec inventory.view delegue lit les produits');

set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select is(public.test_rs_lire('ingredients') + public.test_rs_lire('stock_movements')
          + public.test_rs_lire('suppliers'), 0, 'B: le proprietaire d un autre restaurant ne lit rien');
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is(public.test_rs_lire('ingredients') + public.test_rs_lire('suppliers'), 0, 'B: anon ne lit rien');
reset role;

-- ===========================================================================
-- C. Inventaire: l'ecart affiche est applique au stock courant
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
create temp table rs_count as
  select public.open_stock_count('f5000000-0000-4000-8000-00000000000a', 'RS',
    null, array['f5100000-0000-4000-8000-000000000102', 'f5100000-0000-4000-8000-000000000104']::uuid[]) as id;
reset role;

-- Vente de 2 beignets pendant le comptage (1 kg de farine chacun), par la
-- fonction de destockage du serveur: farine 10 -> 8.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(public.destock_order('f5400000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-00000000000a'),
  1, 'C: la vente destocke la farine pendant le comptage');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select lives_ok(
  $$select public.save_stock_count_lines('f5000000-0000-4000-8000-00000000000a', (select id from rs_count),
    '[{"ingredient_id":"f5100000-0000-4000-8000-000000000102","counted_qty":9},
      {"ingredient_id":"f5100000-0000-4000-8000-000000000104","counted_qty":4}]'::jsonb)$$,
  'C: saisie farine 9, huile 4');
select is(public.commit_stock_count('f5000000-0000-4000-8000-00000000000a', (select id from rs_count)),
  2, 'C: deux produits avec ecart, comme le dialogue');
reset role;

select is((select current_stock from public.ingredients where id = 'f5100000-0000-4000-8000-000000000102'),
  7.000::numeric, 'C: farine finale 7 = compte 9 + vente -2 (la vente n est pas effacee)');
select is((select quantity from public.stock_movements
            where ingredient_id = 'f5100000-0000-4000-8000-000000000102' and movement_type = 'physical_count'),
  (select variance from public.stock_count_lines
    where count_id = (select id from rs_count) and ingredient_id = 'f5100000-0000-4000-8000-000000000102'),
  'C: le mouvement ecrit (-1) est l ecart affiche (compte - theorique fige)');
select is((select current_stock from public.ingredients where id = 'f5100000-0000-4000-8000-000000000104'),
  4.000::numeric, 'C temoin: sans mouvement pendant le comptage, le stock vaut le compte');
select is(
  (select sum(i.current_stock - m.total) from public.ingredients i
     join (select ingredient_id, sum(quantity) as total from public.stock_movements group by ingredient_id) m
       on m.ingredient_id = i.id
    where i.id in ('f5100000-0000-4000-8000-000000000102', 'f5100000-0000-4000-8000-000000000104')),
  0.000::numeric, 'C: stock = somme des mouvements apres validation');

select * from finish();
rollback;
