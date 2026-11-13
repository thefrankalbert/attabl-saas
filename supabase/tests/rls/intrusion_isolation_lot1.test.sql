-- Test d'intrusion du 2026-11-12, lot 1 (migration 20261112210000).
--
-- Chaque garde est mesuree dans les DEUX sens : le cas qui doit etre refuse
-- (correction) et le cas legitime qui doit continuer de passer (temoin).
--
--   T-01  supplement / variante / option / suggestion sur le plat d'un autre
--         restaurant : refuse. Sur son propre plat : accepte.
--   T-06  super-administrateur revoque : is_super_admin() = false. Vivant : true.
--   T-03  membre desactive : ne lit plus le journal d'audit ni les droits par
--         role. Membre actif : les lit toujours.
--
-- Execution : bash scripts/run-pgtap.sh (CI "Privileges et RLS").

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

-- Deux restaurants A et B, un proprietaire chacun, un gerant desactive dans A,
-- un super-administrateur vivant et un revoque.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-a@test.local', 'x', now(), now()),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-b@test.local', 'x', now(), now()),
  ('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerant-desactive@test.local', 'x', now(), now()),
  ('e1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa-vivant@test.local', 'x', now(), now()),
  ('e1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa-revoque@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values
  ('e2000000-0000-0000-0000-00000000000a', 'intrusion-a', 'Intrusion A', true),
  ('e2000000-0000-0000-0000-00000000000b', 'intrusion-b', 'Intrusion B', true);

-- La garde prevent_super_admin_elevation ne laisse creer un super-administrateur
-- qu'au role de service : on reproduit ce contexte le temps de l'insertion.
set local request.jwt.claim.role = 'service_role';
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, is_super_admin)
values
  (gen_random_uuid(), 'e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000001', 'proprio-a@test.local', 'owner', true, false),
  (gen_random_uuid(), 'e2000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-000000000002', 'proprio-b@test.local', 'owner', true, false),
  (gen_random_uuid(), 'e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000003', 'gerant-desactive@test.local', 'manager', false, false),
  (gen_random_uuid(), 'e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000004', 'sa-vivant@test.local', 'owner', true, true),
  (gen_random_uuid(), 'e2000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-000000000005', 'sa-revoque@test.local', 'owner', false, true);

reset request.jwt.claim.role;

insert into public.categories (id, tenant_id, name)
values
  ('e3000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'Plats A'),
  ('e3000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'Plats B');

insert into public.menu_items (id, tenant_id, category_id, name, price)
values
  ('e4000000-0000-0000-0000-00000000000a', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'Plat de A', 5000),
  ('e4000000-0000-0000-0000-0000000000a2', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-00000000000a', 'Second plat de A', 3000),
  ('e4000000-0000-0000-0000-00000000000b', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-00000000000b', 'Plat de B', 7000);

insert into public.audit_log (tenant_id, action, entity_type)
values ('e2000000-0000-0000-0000-00000000000a', 'create', 'menu_item');

insert into public.role_permissions (tenant_id, role, permissions)
values ('e2000000-0000-0000-0000-00000000000a', 'waiter', '{"orders.view": true}'::jsonb);

-- ------------------------------------------------------------------ T-01
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-000000000001"}';

select lives_ok(
  $$insert into public.item_modifiers (tenant_id, menu_item_id, name, price)
    values ('e2000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'Piment', 0)$$,
  'T-01 temoin: le proprietaire de A ajoute un supplement a SON plat'
);
select throws_ok(
  $$insert into public.item_modifiers (tenant_id, menu_item_id, name, price)
    values ('e2000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000b', 'Injecte', 0)$$,
  '23503', null,
  'T-01: supplement de A refuse sur le plat de B'
);
select throws_ok(
  $$insert into public.item_price_variants (tenant_id, menu_item_id, variant_name_fr, price)
    values ('e2000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000b', 'Injectee', 1)$$,
  '23503', null,
  'T-01: variante de prix de A refusee sur le plat de B'
);
select throws_ok(
  $$insert into public.item_options (tenant_id, menu_item_id, name_fr)
    values ('e2000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000b', 'Injectee')$$,
  '23503', null,
  'T-01: option de A refusee sur le plat de B'
);
select throws_ok(
  $$insert into public.item_suggestions (tenant_id, menu_item_id, suggested_item_id)
    values ('e2000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000b')$$,
  '23503', null,
  'T-01: suggestion de A refusee vers le plat de B'
);
select lives_ok(
  $$insert into public.item_suggestions (tenant_id, menu_item_id, suggested_item_id)
    values ('e2000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-0000000000a2')$$,
  'T-01 temoin: suggestion entre deux plats de A acceptee'
);
select throws_ok(
  $$update public.item_modifiers set menu_item_id = 'e4000000-0000-0000-0000-00000000000b'
    where name = 'Piment' and tenant_id = 'e2000000-0000-0000-0000-00000000000a'$$,
  '23503', null,
  'T-01: un supplement existant ne peut pas etre deplace vers le plat de B'
);

-- ------------------------------------------------------------------ T-06
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-000000000004"}';
select is(public.is_super_admin(), true, 'T-06 temoin: super-administrateur vivant reconnu');

set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-000000000005"}';
select is(public.is_super_admin(), false, 'T-06: super-administrateur revoque non reconnu');

-- ------------------------------------------------------------------ T-03
set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-000000000001"}';
select is(
  (select count(*)::int from public.audit_log where tenant_id = 'e2000000-0000-0000-0000-00000000000a'),
  1,
  'T-03 temoin: le proprietaire actif lit le journal d audit'
);
select is(
  (select count(*)::int from public.role_permissions where tenant_id = 'e2000000-0000-0000-0000-00000000000a'),
  1,
  'T-03 temoin: le proprietaire actif lit les droits par role'
);

set local request.jwt.claims = '{"sub":"e1000000-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.audit_log where tenant_id = 'e2000000-0000-0000-0000-00000000000a'),
  0,
  'T-03: un gerant desactive ne lit plus le journal d audit'
);
select is(
  (select count(*)::int from public.role_permissions where tenant_id = 'e2000000-0000-0000-0000-00000000000a'),
  0,
  'T-03: un gerant desactive ne lit plus les droits par role'
);

select * from finish();
rollback;
