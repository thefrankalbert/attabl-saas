-- Verrous de plan en base: assignation des serveurs, tables, zones
-- (migration 20261120150000).
--
-- Temoin negatif: sur le code d'AVANT la migration, les assertions 5, 7 et 8
-- echouent (aucun trigger: un tenant Starter ecrit librement dans
-- table_assignments, tables et zones).
-- Execution: scripts/run-pgtap.sh --local
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values
  ('b2000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur-s@test.local', 'x', now(), now(), now()),
  ('b2000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur-p@test.local', 'x', now(), now(), now());

insert into tenants (id, slug, name, subscription_plan, subscription_status, is_active, onboarding_completed) values
  ('b2000000-0000-4000-8000-000000000001', 'vp-starter', 'VP Starter', 'starter', 'active', true, true),
  ('b2000000-0000-4000-8000-000000000002', 'vp-pro', 'VP Pro', 'pro', 'active', true, true),
  ('b2000000-0000-4000-8000-000000000003', 'vp-neuf', 'VP Neuf', 'starter', 'active', true, false);

insert into venues (id, tenant_id, slug, name, is_active) values
  ('b2000000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000001', 'vs', 'VS', false),
  ('b2000000-0000-4000-8000-000000000012', 'b2000000-0000-4000-8000-000000000002', 'vp', 'VP', false),
  ('b2000000-0000-4000-8000-000000000013', 'b2000000-0000-4000-8000-000000000003', 'vn', 'VN', false);

insert into admin_users (id, tenant_id, user_id, email, role, is_active) values
  ('b2000000-0000-4000-8000-000000000021', 'b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-0000000000a1', 'serveur-s@test.local', 'waiter', true),
  ('b2000000-0000-4000-8000-000000000022', 'b2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-0000000000a2', 'serveur-p@test.local', 'waiter', true);

-- 1-3. Onboarding en cours: les tables de depart sont creees, quel que soit le plan.
select lives_ok($$
  insert into zones (id, venue_id, tenant_id, name, prefix)
  values ('b2000000-0000-4000-8000-000000000033', 'b2000000-0000-4000-8000-000000000013', 'b2000000-0000-4000-8000-000000000003', 'Salle', 'S')
$$, 'onboarding en cours (Starter): zone creee');
select lives_ok($$
  insert into tables (zone_id, tenant_id, table_number, display_name)
  values ('b2000000-0000-4000-8000-000000000033', 'b2000000-0000-4000-8000-000000000003', 'S1', 'Table 1')
$$, 'onboarding en cours (Starter): table creee');

-- Etat de depart du Starter et du Pro, onboarding termine: la ligne arrive par
-- le chemin de service (session_replication_role coupe les triggers).
set local session_replication_role = replica;
insert into zones (id, venue_id, tenant_id, name, prefix) values
  ('b2000000-0000-4000-8000-000000000031', 'b2000000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000001', 'Salle', 'S'),
  ('b2000000-0000-4000-8000-000000000032', 'b2000000-0000-4000-8000-000000000012', 'b2000000-0000-4000-8000-000000000002', 'Salle', 'S');
insert into tables (id, zone_id, tenant_id, table_number, display_name) values
  ('b2000000-0000-4000-8000-000000000041', 'b2000000-0000-4000-8000-000000000031', 'b2000000-0000-4000-8000-000000000001', 'S1', 'Table 1'),
  ('b2000000-0000-4000-8000-000000000042', 'b2000000-0000-4000-8000-000000000032', 'b2000000-0000-4000-8000-000000000002', 'S1', 'Table 1');
-- Leurs tables de depart existent: ils sont initialises (migration 20261120160000).
insert into tenant_tables_initialisees (tenant_id) values
  ('b2000000-0000-4000-8000-000000000001'), ('b2000000-0000-4000-8000-000000000002');
set local session_replication_role = origin;

select is((select count(*)::int from tables where tenant_id = 'b2000000-0000-4000-8000-000000000003'), 1,
  'onboarding en cours: la table existe');

-- 4-5. Assignation des serveurs: Pro oui, Starter non.
select lives_ok($$
  insert into table_assignments (tenant_id, table_id, server_id)
  values ('b2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000042', 'b2000000-0000-4000-8000-000000000022')
$$, 'Pro: assignation d un serveur acceptee');
select throws_ok($$
  insert into table_assignments (tenant_id, table_id, server_id)
  values ('b2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000041', 'b2000000-0000-4000-8000-000000000021')
$$, '23514', null, 'Starter: assignation d un serveur refusee');

-- 6-9. Gestion des tables apres l'onboarding.
select lives_ok($$
  insert into tables (zone_id, tenant_id, table_number, display_name)
  values ('b2000000-0000-4000-8000-000000000032', 'b2000000-0000-4000-8000-000000000002', 'S2', 'Table 2')
$$, 'Pro: table ajoutee');
select throws_ok($$
  insert into tables (zone_id, tenant_id, table_number, display_name)
  values ('b2000000-0000-4000-8000-000000000031', 'b2000000-0000-4000-8000-000000000001', 'S2', 'Table 2')
$$, '23514', null, 'Starter: ajout de table refuse');
select throws_ok($$
  insert into zones (venue_id, tenant_id, name, prefix)
  values ('b2000000-0000-4000-8000-000000000011', 'b2000000-0000-4000-8000-000000000001', 'Terrasse', 'T')
$$, '23514', null, 'Starter: ajout de zone refuse');
select lives_ok($$
  update tables set display_name = 'Table une' where id = 'b2000000-0000-4000-8000-000000000041'
$$, 'Starter: renommer une table existante reste permis');

select * from finish();
rollback;
