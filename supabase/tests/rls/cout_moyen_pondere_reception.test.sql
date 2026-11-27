-- Module de stock, verification de mise en production du 2026-11-24
-- (rapport ui-stock.md, soupcon a / constat 4). Migration 20261124210600.
--
-- Une reception (`manual_add`) saisie avec un prix d'achat recalcule le cout
-- unitaire du produit (cout moyen pondere); sans prix, le cout ne bouge pas.
-- Scenarios chiffres:
--   A. stock 15 a 1000, reception de 5 a 1600 -> stock 20, cout 1150.00
--   B. reception sans prix -> cout inchange (temoin), unit_cost NULL
--   C. stock -2, reception de 4 a 900 -> stock 2, cout 900.00
--   D. le cas du rapport: stock 15 a 1000, 0.125 a 1500 -> cout 1004.13
--   E. prix refuse hors reception, nul ou negatif (22023)
--   F. serveur sans inventory.edit refuse (42501), cout inchange
--   G. signature: une seule fonction, ancien appel a 7 arguments nommes OK,
--      droits EXECUTE inchanges, registre = stock
--
-- Temoin negatif: chaque cout attendu apres reception est precede de la
-- lecture du cout AVANT (1000, 500, 300): sans la migration, la valeur lue
-- apres reste celle d'avant et les assertions A, C, D echouent.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c0000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-cm@test.local', 'x', now(), now()),
  ('c0000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur-cm@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('c0000000-0000-4000-8000-00000000000a', 'cm-a', 'CM A', true, 'business', 'active');

insert into public.admin_users (tenant_id, user_id, email, role, is_active, custom_permissions)
values
  ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-0000000000a1', 'proprio-cm@test.local', 'owner', true, null),
  ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-0000000000a2', 'serveur-cm@test.local', 'waiter', true, null);

-- Ecrits par le proprietaire de la base (hors RLS et hors garde du registre).
insert into public.ingredients (id, tenant_id, name, unit, current_stock, cost_per_unit) values
  ('c1000000-0000-4000-8000-000000000701', 'c0000000-0000-4000-8000-00000000000a', 'Farine', 'kg', 15, 1000),
  ('c1000000-0000-4000-8000-000000000702', 'c0000000-0000-4000-8000-00000000000a', 'Huile', 'L', -2, 500),
  ('c1000000-0000-4000-8000-000000000703', 'c0000000-0000-4000-8000-00000000000a', 'Sel', 'kg', 10, 300),
  ('c1000000-0000-4000-8000-000000000704', 'c0000000-0000-4000-8000-00000000000a', 'Sucre', 'kg', 8, 700),
  ('c1000000-0000-4000-8000-000000000705', 'c0000000-0000-4000-8000-00000000000a', 'Mais', 'kg', 15, 1000);
insert into public.stock_movements (tenant_id, ingredient_id, movement_type, quantity) values
  ('c0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000701', 'opening', 15),
  ('c0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000702', 'opening', -2),
  ('c0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000703', 'opening', 10),
  ('c0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000704', 'opening', 8),
  ('c0000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000705', 'opening', 15);

-- ===========================================================================
-- G. Signature et droits
-- ===========================================================================
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'adjust_ingredient_stock_tx'),
  1, 'G: une seule fonction adjust_ingredient_stock_tx (ancienne surcharge supprimee)');
select is((select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'adjust_ingredient_stock_tx'),
  'p_tenant_id uuid, p_ingredient_id uuid, p_delta numeric, p_movement_type text, p_notes text, p_created_by uuid, p_supplier_id uuid, p_unit_cost numeric',
  'G: le prix est le 8e parametre');
select ok(has_function_privilege('authenticated',
  'public.adjust_ingredient_stock_tx(uuid,uuid,numeric,text,text,uuid,uuid,numeric)', 'EXECUTE'),
  'G: authenticated garde EXECUTE');
select ok(not has_function_privilege('anon',
  'public.adjust_ingredient_stock_tx(uuid,uuid,numeric,text,text,uuid,uuid,numeric)', 'EXECUTE'),
  'G: anon n a pas EXECUTE');
select ok((select prosecdef from pg_proc where proname = 'adjust_ingredient_stock_tx'),
  'G: la fonction reste SECURITY DEFINER');

-- ===========================================================================
-- A, B, C, D, E. Le proprietaire (inventory.edit)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

-- A
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000701'),
  1000.00::numeric, 'A temoin: cout avant reception 1000');
select is(public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000701', 5, 'manual_add', null, null, null, 1600),
  20.000::numeric, 'A: reception de 5 sur 15 -> stock 20');
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000701'),
  1150.00::numeric, 'A: cout (15 x 1000 + 5 x 1600) / 20 = 1150');
select is((select unit_cost from public.stock_movements
            where ingredient_id = 'c1000000-0000-4000-8000-000000000701' and movement_type = 'manual_add'),
  1600.0000::numeric, 'A: le mouvement de reception garde le prix recu');

-- B
select is(public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000703', 4, 'manual_add'),
  14.000::numeric, 'B: reception sans prix -> stock 14');
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000703'),
  300.00::numeric, 'B: sans prix, le cout ne change pas (300)');
select ok((select unit_cost is null from public.stock_movements
            where ingredient_id = 'c1000000-0000-4000-8000-000000000703' and movement_type = 'manual_add'),
  'B: sans prix, unit_cost est NULL');
select lives_ok(
  $$select public.adjust_ingredient_stock_tx(p_tenant_id => 'c0000000-0000-4000-8000-00000000000a',
      p_ingredient_id => 'c1000000-0000-4000-8000-000000000703', p_delta => 1,
      p_movement_type => 'manual_add', p_notes => null, p_created_by => null, p_supplier_id => null)$$,
  'G: l ancien appel a 7 arguments nommes (code en ligne) passe toujours');
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000703'),
  300.00::numeric, 'G: l ancien appel ne touche pas au cout');
select is(public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000701', -2, 'manual_remove'),
  18.000::numeric, 'B: un retrait sans prix -> stock 18');
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000701'),
  1150.00::numeric, 'B: un retrait ne change pas le cout');

-- C
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000702'),
  500.00::numeric, 'C temoin: cout avant reception 500, stock -2');
select is(public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000702', 4, 'manual_add', null, null, null, 900),
  2.000::numeric, 'C: reception de 4 sur -2 -> stock 2');
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000702'),
  900.00::numeric, 'C: stock negatif compte pour 0 -> cout = prix recu 900');

-- D
select is(public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000705', 0.125, 'manual_add', null, null, null, 1500),
  15.125::numeric, 'D: reception de 0.125 sur 15 -> stock 15.125');
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000705'),
  1004.13::numeric, 'D: (15 x 1000 + 0.125 x 1500) / 15.125 = 1004.13 (arrondi a 2 decimales)');

-- E
select throws_ok(
  $$select public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000701', -1, 'manual_remove', null, null, null, 1200)$$,
  '22023', null, 'E: un prix sur un retrait est refuse');
select throws_ok(
  $$select public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000701', 1, 'manual_add', null, null, null, 0)$$,
  '22023', null, 'E: un prix nul est refuse');
select throws_ok(
  $$select public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000701', 1, 'manual_add', null, null, null, -50)$$,
  '22023', null, 'E: un prix negatif est refuse');

-- ===========================================================================
-- F. Le serveur (waiter, sans inventory.edit)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok(
  $$select public.adjust_ingredient_stock_tx('c0000000-0000-4000-8000-00000000000a',
    'c1000000-0000-4000-8000-000000000704', 2, 'manual_add', null, null, null, 100)$$,
  '42501', null, 'F: serveur sans inventory.edit refuse');
reset role;

select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000704'),
  700.00::numeric, 'F: apres le refus, le cout reste 700');
select is((select current_stock from public.ingredients where id = 'c1000000-0000-4000-8000-000000000704'),
  8.000::numeric, 'F: apres le refus, le stock reste 8');
select is((select cost_per_unit from public.ingredients where id = 'c1000000-0000-4000-8000-000000000701'),
  1150.00::numeric, 'E: apres les refus, le cout reste 1150');
select is(
  (select sum(i.current_stock - m.total) from public.ingredients i
     join (select ingredient_id, sum(quantity) as total from public.stock_movements group by ingredient_id) m
       on m.ingredient_id = i.id
    where i.tenant_id = 'c0000000-0000-4000-8000-00000000000a'),
  0.000::numeric, 'G: stock = somme des mouvements pour chaque produit');

select * from finish();
rollback;
