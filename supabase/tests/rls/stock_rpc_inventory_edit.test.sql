-- Les 8 RPC d'ecriture du stock exigent `inventory.edit`, et l'auteur d'un
-- mouvement vient de la session, pas du parametre (audit B51, Haute).
--
-- CE QUE CE TEST VERROUILLE. Avant 20261123100100, ces fonctions ne
-- verifiaient que l'appartenance au restaurant: un serveur appelait la RPC
-- directement avec sa session et modifiait le stock, declarait des pertes ou
-- validait un inventaire. Et `p_created_by` etait enregistre tel qu'envoye: un
-- mouvement pouvait etre attribue a un autre employe.
--
-- Execution: scripts/run-pgtap.sh --local

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

-- Plan pro: le module de stock est reserve aux plans Pro et plus (declencheur).
insert into public.tenants (id, slug, name, is_active, currency, subscription_status, subscription_plan) values
  ('b51a0000-0000-0000-0000-00000000000a', 'b51-resto', 'Resto B51', true, 'XOF', 'active', 'pro');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e51a0000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner-b51@exemple.test', 'x', now(), now()),
  ('e51b0000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-b51@exemple.test', 'x', now(), now()),
  ('e51c0000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-b51@exemple.test', 'x', now(), now());

insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('d51a0000-0000-0000-0000-00000000000a', 'e51a0000-0000-0000-0000-00000000000a',
   'b51a0000-0000-0000-0000-00000000000a', 'owner-b51@exemple.test', 'owner', true),
  ('d51b0000-0000-0000-0000-00000000000b', 'e51b0000-0000-0000-0000-00000000000b',
   'b51a0000-0000-0000-0000-00000000000a', 'serveur-b51@exemple.test', 'waiter', true),
  ('d51c0000-0000-0000-0000-00000000000c', 'e51c0000-0000-0000-0000-00000000000c',
   'b51a0000-0000-0000-0000-00000000000a', 'gerant-b51@exemple.test', 'manager', true);

insert into public.categories (id, tenant_id, name) values
  ('c51a0000-0000-0000-0000-00000000000a', 'b51a0000-0000-0000-0000-00000000000a', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price) values
  ('a51a0000-0000-0000-0000-00000000000a', 'b51a0000-0000-0000-0000-00000000000a',
   'c51a0000-0000-0000-0000-00000000000a', 'Riz sauce', 2500);

insert into public.ingredients (id, tenant_id, name, current_stock) values
  ('151a0000-0000-0000-0000-00000000000a', 'b51a0000-0000-0000-0000-00000000000a', 'Riz', 10);

select is(
  (select count(*)::int from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('adjust_ingredient_stock_tx','record_loss_tx','set_recipe_tx',
                        'set_opening_stock','open_stock_count','save_stock_count_lines',
                        'commit_stock_count','cancel_stock_count','import_recipes_tx',
                        'reconcile_stock_ledger')
      and p.prosrc like '%assert_inventory_edit(p_tenant_id)%'
      and p.prosrc not like '%assert_tenant_member%'),
  10,
  'les 10 RPC de stock (dont import_recipes_tx et reconcile_stock_ledger) passent par la garde inventory.edit');

-- Le serveur (waiter, sans inventory.edit), avec sa session.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e51b0000-0000-0000-0000-00000000000b","role":"authenticated"}';

select throws_ok(
  $$select public.adjust_ingredient_stock_tx('b51a0000-0000-0000-0000-00000000000a',
    '151a0000-0000-0000-0000-00000000000a', 5, 'manual_add')$$,
  '42501', NULL, 'serveur: ajustement de stock refuse');
select throws_ok(
  $$select public.record_loss_tx('b51a0000-0000-0000-0000-00000000000a',
    '151a0000-0000-0000-0000-00000000000a', 5, 'theft')$$,
  '42501', NULL, 'serveur: declaration de perte refusee');
select throws_ok(
  $$select public.set_recipe_tx('b51a0000-0000-0000-0000-00000000000a',
    gen_random_uuid(), '[]'::jsonb)$$,
  '42501', NULL, 'serveur: fiche technique refusee');
select throws_ok(
  $$select public.set_opening_stock('b51a0000-0000-0000-0000-00000000000a',
    '151a0000-0000-0000-0000-00000000000a', 0)$$,
  '42501', NULL, 'serveur: stock d ouverture refuse');
select throws_ok(
  $$select public.open_stock_count('b51a0000-0000-0000-0000-00000000000a')$$,
  '42501', NULL, 'serveur: ouverture d inventaire refusee');
select throws_ok(
  $$select public.save_stock_count_lines('b51a0000-0000-0000-0000-00000000000a',
    gen_random_uuid(), '[]'::jsonb)$$,
  '42501', NULL, 'serveur: saisie d inventaire refusee');
select throws_ok(
  $$select public.commit_stock_count('b51a0000-0000-0000-0000-00000000000a', gen_random_uuid())$$,
  '42501', NULL, 'serveur: validation d inventaire refusee');
select throws_ok(
  $$select public.cancel_stock_count('b51a0000-0000-0000-0000-00000000000a', gen_random_uuid())$$,
  '42501', NULL, 'serveur: annulation d inventaire refusee');
select throws_ok(
  $$select public.import_recipes_tx('b51a0000-0000-0000-0000-00000000000a',
    '[{"menu_item_id":"a51a0000-0000-0000-0000-00000000000a","ingredient_name":"Riz","unit":"kg","quantity_needed":0.2}]'::jsonb)$$,
  '42501', NULL, 'serveur: import des fiches techniques refuse');
-- Audit B126: le rattrapage du registre de stock (ecart entre le stock et la
-- somme des mouvements: l'ingredient a ete cree a 10 sans mouvement).
select throws_ok(
  $$select public.reconcile_stock_ledger('b51a0000-0000-0000-0000-00000000000a',
    'e51a0000-0000-0000-0000-00000000000a')$$,
  '42501', NULL, 'serveur: rattrapage du registre de stock refuse (en signant au nom du proprietaire)');

-- Le gerant (manager: inventory.edit par la matrice par defaut).
set local "request.jwt.claims" = '{"sub":"e51c0000-0000-0000-0000-00000000000c","role":"authenticated"}';
select lives_ok(
  $$select public.import_recipes_tx('b51a0000-0000-0000-0000-00000000000a',
    '[{"menu_item_id":"a51a0000-0000-0000-0000-00000000000a","ingredient_name":"Riz","unit":"kg","quantity_needed":0.2}]'::jsonb)$$,
  'temoin: un membre avec inventory.edit importe les fiches techniques');
-- Le gerant rattrape le registre en tentant de signer au nom du serveur.
select lives_ok(
  $$select public.reconcile_stock_ledger('b51a0000-0000-0000-0000-00000000000a',
    'e51b0000-0000-0000-0000-00000000000b')$$,
  'temoin: un membre avec inventory.edit rattrape le registre de stock');

-- Le proprietaire, qui tente d'attribuer le mouvement au serveur.
set local "request.jwt.claims" = '{"sub":"e51a0000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok(
  $$select public.set_opening_stock('b51a0000-0000-0000-0000-00000000000a',
    '151a0000-0000-0000-0000-00000000000a', 25, 'e51b0000-0000-0000-0000-00000000000b')$$,
  'temoin: le proprietaire fixe le stock d ouverture');

reset role;

select is(
  (select created_by from public.stock_movements
    where tenant_id = 'b51a0000-0000-0000-0000-00000000000a' and movement_type = 'opening'),
  'e51a0000-0000-0000-0000-00000000000a'::uuid,
  'l auteur enregistre est la session, pas le p_created_by envoye');

select is(
  (select array_agg(distinct created_by::text) from public.stock_movements
    where tenant_id = 'b51a0000-0000-0000-0000-00000000000a' and reason_code = 'reconcile'),
  array['e51c0000-0000-0000-0000-00000000000c'],
  'rattrapage: l auteur enregistre est l appelant (le gerant), pas le p_created_by envoye');

select is(
  has_function_privilege('authenticated',
    'public.set_opening_stock(uuid, uuid, numeric, uuid)', 'execute'),
  true,
  'non-regression: authenticated garde EXECUTE (le code en ligne appelle la RPC)');

select * from finish();
rollback;
