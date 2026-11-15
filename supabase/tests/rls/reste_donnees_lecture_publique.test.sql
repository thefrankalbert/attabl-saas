-- Test d'intrusion du 2026-11-12, reste a faire : T-02, T-04, T-05
-- (migration 20261114110000).
--
-- Chaque garde est mesuree dans les DEUX sens : le cas refuse (correction) et le
-- cas legitime qui doit continuer de passer (temoin).
--
--   T-02  un compte connecte NON membre ne lit plus la ligne tenants d'un autre
--         restaurant (ni telephone ni abonnement). Temoins : un membre lit la
--         sienne, anon lit la vitrine, un super-administrateur lit les actifs.
--   T-04  la carte d'un restaurant supprime, suspendu ou gele depuis plus de 7
--         jours n'est plus lisible en anon. Temoins : restaurant actif et
--         restaurant en periode de grace (gele pour fin d'essai < 7 jours)
--         restent lisibles ; un membre lit toujours la carte de son restaurant
--         ferme.
--   T-05  get_co_ordered_items ne repond plus pour un restaurant ferme ;
--         temoin : elle repond pour un restaurant visible.
--
-- Execution : bash scripts/run-pgtap.sh (CI "Privileges et RLS").

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'membre-a@test.local', 'x', now(), now()),
  ('f1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'visiteur@test.local', 'x', now(), now()),
  ('f1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa@test.local', 'x', now(), now()),
  ('f1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'membre-c@test.local', 'x', now(), now()),
  ('f1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-groupe@test.local', 'x', now(), now());

-- A actif | B actif | C supprime | D suspendu | E gele fin d'essai (grace) | F gele fin d'essai (depuis 8 jours)
insert into public.tenants (id, slug, name, is_active, phone, subscription_status, deleted_at, suspended_at, freeze_reason, trial_ends_at)
values
  ('f2000000-0000-0000-0000-00000000000a', 'reste-a', 'Reste A', true, '+22670000001', 'active', null, null, null, null),
  ('f2000000-0000-0000-0000-00000000000b', 'reste-b', 'Reste B', true, '+22670000002', 'active', null, null, null, null),
  ('f2000000-0000-0000-0000-00000000000c', 'reste-c', 'Reste C', false, '+22670000003', 'active', now(), null, null, null),
  ('f2000000-0000-0000-0000-00000000000d', 'reste-d', 'Reste D', true, '+22670000004', 'active', null, now(), null, null),
  ('f2000000-0000-0000-0000-00000000000e', 'reste-e', 'Reste E', false, '+22670000005', 'frozen', null, null, 'trial_expired', now() - interval '3 days'),
  ('f2000000-0000-0000-0000-00000000000f', 'reste-f', 'Reste F', false, '+22670000006', 'frozen', null, null, 'trial_expired', now() - interval '8 days');

insert into public.restaurant_groups (id, owner_user_id)
values ('f6000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000005');
update public.tenants set group_id = 'f6000000-0000-0000-0000-000000000001'
 where id = 'f2000000-0000-0000-0000-00000000000c';

set local request.jwt.claim.role = 'service_role';
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, is_super_admin)
values
  (gen_random_uuid(), 'f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000001', 'membre-a@test.local', 'owner', true, false),
  (gen_random_uuid(), 'f2000000-0000-0000-0000-00000000000b', 'f1000000-0000-0000-0000-000000000002', 'visiteur@test.local', 'owner', true, false),
  (gen_random_uuid(), 'f2000000-0000-0000-0000-00000000000a', 'f1000000-0000-0000-0000-000000000003', 'sa@test.local', 'owner', true, true),
  (gen_random_uuid(), 'f2000000-0000-0000-0000-00000000000c', 'f1000000-0000-0000-0000-000000000004', 'membre-c@test.local', 'owner', true, false);
reset request.jwt.claim.role;

insert into public.categories (id, tenant_id, name)
select ('f3000000-0000-0000-0000-0000000000' || right(t.id::text, 2))::uuid, t.id, 'Plats ' || t.slug
from public.tenants t where t.slug like 'reste-%';

insert into public.menu_items (id, tenant_id, category_id, name, price)
select ('f4000000-0000-0000-0000-0000000000' || right(t.id::text, 2))::uuid, t.id,
       ('f3000000-0000-0000-0000-0000000000' || right(t.id::text, 2))::uuid, 'Plat ' || t.slug, 1000
from public.tenants t where t.slug like 'reste-%';

-- Une commande a deux plats chez A (visible) et chez C (supprime) pour la co-occurrence.
insert into public.menu_items (id, tenant_id, category_id, name, price)
values
  ('f4000000-0000-0000-0000-0000000000a2', 'f2000000-0000-0000-0000-00000000000a', 'f3000000-0000-0000-0000-00000000000a', 'Second plat A', 1000),
  ('f4000000-0000-0000-0000-0000000000c2', 'f2000000-0000-0000-0000-00000000000c', 'f3000000-0000-0000-0000-00000000000c', 'Second plat C', 1000);

insert into public.orders (id, tenant_id, order_number, subtotal, total)
values
  ('f5000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'RESTE-A', 2000, 2000),
  ('f5000000-0000-0000-0000-00000000000c', 'f2000000-0000-0000-0000-00000000000c', 'RESTE-C', 2000, 2000);

insert into public.order_items (tenant_id, order_id, menu_item_id, item_name, price_at_order, quantity)
values
  ('f2000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-00000000000a', 'Plat reste-a', 1000, 1),
  ('f2000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-0000000000a2', 'Second plat A', 1000, 1),
  ('f2000000-0000-0000-0000-00000000000c', 'f5000000-0000-0000-0000-00000000000c', 'f4000000-0000-0000-0000-00000000000c', 'Plat reste-c', 1000, 1),
  ('f2000000-0000-0000-0000-00000000000c', 'f5000000-0000-0000-0000-00000000000c', 'f4000000-0000-0000-0000-0000000000c2', 'Second plat C', 1000, 1);

-- Lieux, zones, tables et cartes: A (visible) et C (supprime).
insert into public.venues (id, tenant_id, name, slug) values
  ('f7000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'Salle A', 'salle-a'),
  ('f7000000-0000-0000-0000-00000000000c', 'f2000000-0000-0000-0000-00000000000c', 'Salle C', 'salle-c');
insert into public.zones (id, venue_id, tenant_id, name, prefix) values
  ('f8000000-0000-0000-0000-00000000000a', 'f7000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'Zone A', 'A'),
  ('f8000000-0000-0000-0000-00000000000c', 'f7000000-0000-0000-0000-00000000000c', 'f2000000-0000-0000-0000-00000000000c', 'Zone C', 'C');
insert into public.tables (id, zone_id, tenant_id, table_number, display_name, capacity, is_active) values
  ('f9000000-0000-0000-0000-00000000000a', 'f8000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'A1', 'A1', 2, true),
  ('f9000000-0000-0000-0000-00000000000c', 'f8000000-0000-0000-0000-00000000000c', 'f2000000-0000-0000-0000-00000000000c', 'C1', 'C1', 2, true);
insert into public.menus (id, tenant_id, name, slug) values
  ('fa000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-00000000000a', 'Carte A', 'carte-a'),
  ('fa000000-0000-0000-0000-00000000000c', 'f2000000-0000-0000-0000-00000000000c', 'Carte C', 'carte-c');

-- ------------------------------------------------------------------ T-02
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000002"}';

select is(
  (select count(*)::int from public.tenants where id = 'f2000000-0000-0000-0000-00000000000a'),
  0,
  'T-02: un compte connecte non membre ne lit pas la ligne tenants d''un autre restaurant');

select is(
  (select count(*)::int from public.tenants where phone = '+22670000001'),
  0,
  'T-02: ni son telephone, meme en filtrant dessus');

select is(
  (select phone from public.tenants where id = 'f2000000-0000-0000-0000-00000000000b'),
  '+22670000002',
  'T-02 temoin: le membre lit toujours la ligne de SON restaurant, colonnes sensibles comprises');

set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.tenants where id = 'f2000000-0000-0000-0000-00000000000b'),
  1,
  'T-02 temoin: le super-administrateur lit toujours les restaurants actifs');

set local role anon;
set local request.jwt.claims = '{}';
select is(
  (select slug from public.tenants where id = 'f2000000-0000-0000-0000-00000000000a'),
  'reste-a',
  'T-02 temoin: anon lit toujours la vitrine d''un restaurant actif');

-- ------------------------------------------------------------------ T-04
select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000a'),
  2,
  'T-04 temoin: anon lit la carte d''un restaurant actif');

select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  0,
  'T-04: carte d''un restaurant supprime illisible en anon');

select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000d'),
  0,
  'T-04: carte d''un restaurant suspendu illisible en anon');

select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000e'),
  1,
  'T-04 temoin: carte d''un restaurant gele depuis 3 jours (grace de 7 jours) toujours lisible');

select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000f'),
  0,
  'T-04: carte d''un restaurant gele depuis 8 jours illisible');

select is(
  (select count(*)::int from public.categories where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  0,
  'T-04: categories d''un restaurant supprime illisibles aussi');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000004"}';
select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  2,
  'T-04 temoin: un membre lit toujours la carte de son restaurant ferme');

set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  0,
  'T-04: un compte connecte non membre ne lit pas la carte d''un restaurant supprime');

-- Temoins supplementaires (compte connecte, groupe, super-administrateur).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000a'),
  2,
  'T-04 temoin: un compte connecte non membre lit la carte d''un restaurant ACTIF');

set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000005"}';
select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  2,
  'T-04 temoin: le proprietaire du groupe lit la carte du restaurant ferme de son groupe');

set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.menu_items where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  2,
  'T-04 temoin: le super-administrateur lit la carte d''un restaurant ferme');

set local role anon;
set local request.jwt.claims = '{}';
select is(
  (select count(*)::int from public.tables where tenant_id = 'f2000000-0000-0000-0000-00000000000a'),
  1,
  'T-04 temoin: anon lit les tables d''un restaurant actif');
select is(
  (select count(*)::int from public.tables where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  0,
  'T-04: tables d''un restaurant supprime illisibles en anon');
select is(
  (select count(*)::int from public.venues where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  0,
  'T-04: lieux d''un restaurant supprime illisibles en anon');
select is(
  (select count(*)::int from public.menus where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  0,
  'T-04: cartes d''un restaurant supprime illisibles en anon');
select is(
  (select count(*)::int from public.menus where tenant_id = 'f2000000-0000-0000-0000-00000000000a'),
  1,
  'T-04 temoin: anon lit les cartes d''un restaurant actif');
select is(
  (select count(*)::int from public.categories where tenant_id = 'f2000000-0000-0000-0000-00000000000e'),
  1,
  'T-04 temoin: categories d''un restaurant en periode de grace lisibles');

-- zones: la policy RESTRICTIVE ne retire rien a un membre, et un non-membre ne lit rien.
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000004"}';
select is(
  (select count(*)::int from public.zones where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  1,
  'zones temoin: un membre lit toujours les zones de son restaurant ferme');
set local request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-000000000002"}';
select is(
  (select count(*)::int from public.zones where tenant_id = 'f2000000-0000-0000-0000-00000000000c'),
  0,
  'zones: un compte connecte non membre ne lit pas les zones d''un restaurant supprime');
reset role;

-- create_order_with_items n'est executable que par service_role (BYPASSRLS):
-- la policy RESTRICTIVE ne peut pas casser la creation de commande.
reset role;
select is(
  (select bool_or(has_function_privilege('anon', p.oid, 'execute')
                  or has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_order_with_items'),
  false,
  'create_order_with_items: ni anon ni authenticated ne peuvent l''executer');

set local role anon;
-- ------------------------------------------------------------------ T-05
set local role anon;
set local request.jwt.claims = '{}';
select is(
  (select count(*)::int from public.get_co_ordered_items(
     'f2000000-0000-0000-0000-00000000000c',
     array['f4000000-0000-0000-0000-00000000000c']::uuid[], 6)),
  0,
  'T-05: get_co_ordered_items ne repond plus pour un restaurant supprime');

select is(
  (select count(*)::int from public.get_co_ordered_items(
     'f2000000-0000-0000-0000-00000000000a',
     array['f4000000-0000-0000-0000-00000000000a']::uuid[], 6)),
  1,
  'T-05 temoin: get_co_ordered_items repond pour un restaurant visible');

reset role;
select is(
  has_function_privilege('anon', 'public.is_table_occupied(uuid, text)', 'execute'),
  false,
  'T-05: is_table_occupied reste interdite a anon');

select * from finish();
rollback;
