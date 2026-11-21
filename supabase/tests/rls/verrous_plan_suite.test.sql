-- Verrous de plan, suite du contre-audit (migration 20261121120000).
--
-- Temoin negatif: sur le code d'AVANT la migration, les assertions qui
-- attendent un refus (throws_ok) passent toutes en lives: tables apres
-- onboarding_completed remis a false, assignation reactivee, fiche technique,
-- mouvement manuel, ligne de comptage, ingredient modifie par le client,
-- statut cuisine, rapports appeles par un Starter.
-- Execution: scripts/run-pgtap.sh --local
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

-- Fixtures, ecrites sans triggers (etat de depart, pas un comportement teste).
set local session_replication_role = replica;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at) values
  ('c3000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-s@test.local', 'x', now(), now(), now()),
  ('c3000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-p@test.local', 'x', now(), now(), now()),
  ('c3000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'super@test.local', 'x', now(), now(), now());

insert into tenants (id, slug, name, subscription_plan, subscription_status, trial_ends_at, is_active, onboarding_completed) values
  ('c3000000-0000-4000-8000-000000000001', 'vs-starter', 'VS Starter', 'starter', 'active', now() - interval '20 days', true, true),
  ('c3000000-0000-4000-8000-000000000002', 'vs-pro', 'VS Pro', 'pro', 'active', null, true, true),
  ('c3000000-0000-4000-8000-000000000003', 'vs-neuf', 'VS Neuf', 'starter', 'active', null, true, false),
  ('c3000000-0000-4000-8000-000000000004', 'vs-neuf-bis', 'VS Neuf bis', 'starter', 'active', null, true, false),
  ('c3000000-0000-4000-8000-000000000005', 'vs-neuf-ter', 'VS Neuf ter', 'starter', 'active', null, true, false);

insert into admin_users (id, tenant_id, user_id, email, role, is_active) values
  ('c3000000-0000-4000-8000-000000000011', 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-0000000000a1', 'proprio-s@test.local', 'owner', true),
  ('c3000000-0000-4000-8000-000000000012', 'c3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-0000000000a2', 'proprio-p@test.local', 'owner', true);

insert into admin_users (id, tenant_id, user_id, email, role, is_active, is_super_admin) values
  ('c3000000-0000-4000-8000-000000000013', 'c3000000-0000-4000-8000-000000000003', 'c3000000-0000-4000-8000-0000000000a3', 'super@test.local', 'owner', true, true);

insert into venues (id, tenant_id, slug, name, is_active) values
  ('c3000000-0000-4000-8000-000000000021', 'c3000000-0000-4000-8000-000000000001', 'v', 'V', true),
  ('c3000000-0000-4000-8000-000000000022', 'c3000000-0000-4000-8000-000000000002', 'v', 'V', true),
  ('c3000000-0000-4000-8000-000000000023', 'c3000000-0000-4000-8000-000000000003', 'v', 'V', true),
  ('c3000000-0000-4000-8000-000000000024', 'c3000000-0000-4000-8000-000000000004', 'v', 'V', true),
  ('c3000000-0000-4000-8000-000000000025', 'c3000000-0000-4000-8000-000000000005', 'v', 'V', true);
insert into zones (id, venue_id, tenant_id, name, prefix) values
  ('c3000000-0000-4000-8000-000000000031', 'c3000000-0000-4000-8000-000000000021', 'c3000000-0000-4000-8000-000000000001', 'Salle', 'S'),
  ('c3000000-0000-4000-8000-000000000033', 'c3000000-0000-4000-8000-000000000023', 'c3000000-0000-4000-8000-000000000003', 'Salle', 'S'),
  ('c3000000-0000-4000-8000-000000000034', 'c3000000-0000-4000-8000-000000000024', 'c3000000-0000-4000-8000-000000000004', 'Salle', 'S');
insert into tables (id, zone_id, tenant_id, table_number, display_name) values
  ('c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000031', 'c3000000-0000-4000-8000-000000000001', 'S1', 'Table 1');
insert into tenant_tables_initialisees (tenant_id) values ('c3000000-0000-4000-8000-000000000001');
-- Assignation terminee, creee pendant l'essai.
insert into table_assignments (id, tenant_id, table_id, server_id, ended_at) values
  ('c3000000-0000-4000-8000-000000000051', 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000041', 'c3000000-0000-4000-8000-000000000011', now());
-- Donnees d'inventaire et carte gardees de l'essai.
insert into categories (id, tenant_id, name) values
  ('c3000000-0000-4000-8000-000000000061', 'c3000000-0000-4000-8000-000000000001', 'Plats'),
  ('c3000000-0000-4000-8000-000000000062', 'c3000000-0000-4000-8000-000000000002', 'Plats');
insert into menu_items (id, tenant_id, category_id, name, price) values
  ('c3000000-0000-4000-8000-000000000071', 'c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000061', 'Poulet', 3000),
  ('c3000000-0000-4000-8000-000000000072', 'c3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000062', 'Poulet', 3000);
insert into ingredients (id, tenant_id, name) values
  ('c3000000-0000-4000-8000-000000000081', 'c3000000-0000-4000-8000-000000000001', 'Riz'),
  ('c3000000-0000-4000-8000-000000000082', 'c3000000-0000-4000-8000-000000000002', 'Riz');
insert into stock_counts (id, tenant_id) values
  ('c3000000-0000-4000-8000-000000000091', 'c3000000-0000-4000-8000-000000000001');
-- Une commande d'avant la fin d'essai, une d'apres.
insert into orders (id, tenant_id, order_number, subtotal, total, created_at) values
  ('c3000000-0000-4000-8000-0000000000b1', 'c3000000-0000-4000-8000-000000000001', 'S-1', 3000, 3000, now() - interval '25 days'),
  ('c3000000-0000-4000-8000-0000000000b2', 'c3000000-0000-4000-8000-000000000001', 'S-2', 3000, 3000, now());
insert into order_items (id, order_id, menu_item_id, price_at_order, item_name, tenant_id) values
  ('c3000000-0000-4000-8000-0000000000c1', 'c3000000-0000-4000-8000-0000000000b1', 'c3000000-0000-4000-8000-000000000071', 3000, 'Poulet', 'c3000000-0000-4000-8000-000000000001'),
  ('c3000000-0000-4000-8000-0000000000c2', 'c3000000-0000-4000-8000-0000000000b2', 'c3000000-0000-4000-8000-000000000071', 3000, 'Poulet', 'c3000000-0000-4000-8000-000000000001');

set local session_replication_role = origin;

-- 1-4. Tables: l'attaque onboarding_completed=false ne rouvre rien.
update tenants set onboarding_completed = false where id = 'c3000000-0000-4000-8000-000000000001';
select throws_ok($$
  insert into tables (zone_id, tenant_id, table_number, display_name)
  values ('c3000000-0000-4000-8000-000000000031', 'c3000000-0000-4000-8000-000000000001', 'S2', 'Table 2')
$$, '23514', null, 'Starter: onboarding_completed remis a false ne rouvre pas la creation de tables');
select lives_ok($$
  insert into tables (zone_id, tenant_id, table_number, display_name) values
    ('c3000000-0000-4000-8000-000000000033', 'c3000000-0000-4000-8000-000000000003', 'S1', 'Table 1'),
    ('c3000000-0000-4000-8000-000000000033', 'c3000000-0000-4000-8000-000000000003', 'S2', 'Table 2')
$$, 'restaurant neuf (Starter): premieres tables creees en une fois');
select ok(exists(select 1 from tenant_tables_initialisees where tenant_id = 'c3000000-0000-4000-8000-000000000003'),
  'restaurant neuf: marque initialise apres sa premiere creation');
select throws_ok($$
  insert into tables (zone_id, tenant_id, table_number, display_name)
  values ('c3000000-0000-4000-8000-000000000033', 'c3000000-0000-4000-8000-000000000003', 'S3', 'Table 3')
$$, '23514', null, 'restaurant neuf (Starter): ajouter ensuite une table est refuse');

-- Premiere creation bornee (contre-audit D): au-dela de ce que l'onboarding
-- produit (4000 tables, 20 zones), meme la premiere creation est refusee.
select throws_ok($$
  insert into tables (zone_id, tenant_id, table_number, display_name)
  select 'c3000000-0000-4000-8000-000000000034', 'c3000000-0000-4000-8000-000000000004', 'T' || g, 'T' || g
  from generate_series(1, 4001) g
$$, '23514', null, 'restaurant neuf (Starter): une premiere creation de 4001 tables est refusee');
select throws_ok($$
  insert into zones (venue_id, tenant_id, name, prefix)
  select 'c3000000-0000-4000-8000-000000000025', 'c3000000-0000-4000-8000-000000000005', 'Zone ' || g, 'Z' || g
  from generate_series(1, 21) g
$$, '23514', null, 'restaurant neuf (Starter): plus de 20 zones de depart refusees');

-- 5-6. Assignations.
select throws_ok($$
  update table_assignments set ended_at = null where id = 'c3000000-0000-4000-8000-000000000051'
$$, '23514', null, 'Starter: reactiver une assignation de l essai est refuse');
select lives_ok($$
  update table_assignments set started_at = started_at where id = 'c3000000-0000-4000-8000-000000000051'
$$, 'Starter: une mise a jour sans reactivation passe');

-- 7-8. Fiches techniques.
select throws_ok($$
  insert into recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed)
  values ('c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000071', 'c3000000-0000-4000-8000-000000000081', 1)
$$, '23514', null, 'Starter: fiche technique refusee');
select lives_ok($$
  insert into recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed)
  values ('c3000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000072', 'c3000000-0000-4000-8000-000000000082', 1)
$$, 'Pro: fiche technique acceptee');

-- 9-11. Mouvements de stock et comptage.
select throws_ok($$
  insert into stock_movements (tenant_id, ingredient_id, movement_type, quantity)
  values ('c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000081', 'manual_add', 5)
$$, '23514', null, 'Starter: mouvement de stock manuel refuse');
select lives_ok($$
  insert into stock_movements (tenant_id, ingredient_id, movement_type, quantity)
  values ('c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000081', 'order_destock', -1)
$$, 'Starter: le destockage d une commande reste ouvert');
select throws_ok($$
  insert into stock_count_lines (tenant_id, count_id, ingredient_id, theoretical_qty)
  values ('c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000091', 'c3000000-0000-4000-8000-000000000081', 0)
$$, '23514', null, 'Starter: ligne de comptage refusee');

-- 12-13. Ecran cuisine.
select throws_ok($$
  update order_items set item_status = 'ready' where id = 'c3000000-0000-4000-8000-0000000000c2'
$$, '23514', null, 'Starter: statut cuisine d une commande recente refuse');
select lives_ok($$
  update order_items set item_status = 'ready' where id = 'c3000000-0000-4000-8000-0000000000c1'
$$, 'Starter: la cuisine termine une commande passee pendant l essai');

-- 14-15. Ingredient modifie: ferme au client Starter, ouvert aux fonctions de commande.
select lives_ok($$
  update ingredients set current_stock = 7 where id = 'c3000000-0000-4000-8000-000000000081'
$$, 'Starter: une fonction SQL (proprietaire) peut toujours ecrire le stock');
set local role authenticated;
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-0000000000a1"}';
select throws_ok($$
  update ingredients set current_stock = 99 where id = 'c3000000-0000-4000-8000-000000000081'
$$, '23514', null, 'Starter: le client ne modifie pas un ingredient en direct');

-- 16-17. Rapports appeles par le client Starter.
select throws_ok($$
  select * from get_daily_revenue('c3000000-0000-4000-8000-000000000001', now() - interval '30 days', now())
$$, '42501', null, 'Starter: get_daily_revenue refuse');
select throws_ok($$
  select * from get_top_items('c3000000-0000-4000-8000-000000000001', now() - interval '30 days', now())
$$, '42501', null, 'Starter: get_top_items refuse (valeur par defaut de p_limit conservee)');
-- Contre-audit B: les deux fonctions que modifie le lot pourboires (#446).
select throws_ok($$
  select * from get_order_summary('c3000000-0000-4000-8000-000000000001', now() - interval '30 days', now())
$$, '42501', null, 'Starter: get_order_summary refuse');
select throws_ok($$
  select * from get_server_performance('c3000000-0000-4000-8000-000000000001', now() - interval '30 days', now())
$$, '42501', null, 'Starter: get_server_performance refuse');

set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-0000000000a2"}';
select lives_ok($$
  update ingredients set current_stock = 3 where id = 'c3000000-0000-4000-8000-000000000082'
$$, 'Pro: le client modifie son ingredient');
select lives_ok($$
  select * from get_top_items('c3000000-0000-4000-8000-000000000002', now() - interval '30 days', now())
$$, 'Pro: get_top_items ouvert');
-- Un non-membre recoit le refus d'appartenance, pas une information de plan.
select throws_like($$
  select * from get_daily_revenue('c3000000-0000-4000-8000-000000000001', now() - interval '30 days', now())
$$, 'access denied: caller is not a member%', 'non-membre: refus d appartenance avant tout controle de plan');
select ok(not has_function_privilege('authenticated',
  'public.get_daily_revenue_brut(uuid, timestamp with time zone, timestamp with time zone)', 'EXECUTE'),
  'le corps brut des rapports n est pas appelable par un client');

-- Contre-audit C: un super administrateur passe l'appartenance; le plan juge.
set local request.jwt.claims = '{"sub":"c3000000-0000-4000-8000-0000000000a3"}';
select ok(mon_restaurant_a_le_stock('c3000000-0000-4000-8000-000000000002'),
  'super administrateur: un restaurant Pro dont il n est pas membre a le stock');
select ok(not mon_restaurant_a_le_stock('c3000000-0000-4000-8000-000000000001'),
  'super administrateur: un restaurant Starter n a toujours pas le stock');
reset role;

-- Contre-audit E: le registre n'est ni lisible ni ecrivable par un client.
select ok(not has_table_privilege('anon', 'public.tenant_tables_initialisees', 'SELECT, INSERT, UPDATE, DELETE'),
  'registre tenant_tables_initialisees: aucun droit pour anon');
select ok(not has_table_privilege('authenticated', 'public.tenant_tables_initialisees', 'SELECT, INSERT, UPDATE, DELETE'),
  'registre tenant_tables_initialisees: aucun droit pour authenticated');

select ok(not has_function_privilege('authenticated', 'public.tenant_effective_plan(uuid)', 'EXECUTE'),
  'tenant_effective_plan reste fermee aux clients');

select * from finish();
rollback;
