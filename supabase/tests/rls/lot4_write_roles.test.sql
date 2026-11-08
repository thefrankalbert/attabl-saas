-- LOT 4: fin du balayage. Les trois dernieres tables de donnees metier
-- exigent un ROLE en ecriture.
--
-- Suite de lot3_write_roles.test.sql. Les tables couvertes ici sont celles que
-- l'en-tete du lot 3 annoncait comme "a trancher" et que la lecture des
-- policies reelles a permis de trancher:
--
--   item_options                deux policies ALL permissives, aucun ecrivain
--                               dans `src` - mais le trou est reel via
--                               PostgREST.
--   stock_alert_notifications   ecrite par notification.service avec le client
--                               admin, donc resserrer ne casse rien.
--   table_sessions              chemin chaud du service. La regle retenue est
--                               celle de `orders` (orders.manage), parce que la
--                               fermeture de session se produit DANS markPaid,
--                               qui l'exige deja.
--
-- `table_sessions` est la plus sensible des trois: une table qui ne se ferme
-- plus fait que les commandes du lendemain s'attachent au service de la
-- veille. L'assertion du manager compte donc autant que celle du waiter.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/lot4_write_roles.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-lot4@test.local', 'x', now(), now()),
  ('e2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-lot4@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('e3333333-3333-3333-3333-333333333333', 'tenant-lot4-roles', 'Tenant Lot 4', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  (gen_random_uuid(), 'e3333333-3333-3333-3333-333333333333',
   'e1111111-1111-1111-1111-111111111111', 'gerant-lot4@test.local', 'manager', true),
  (gen_random_uuid(), 'e3333333-3333-3333-3333-333333333333',
   'e2222222-2222-2222-2222-222222222222', 'serveur-lot4@test.local', 'waiter', true);

insert into public.categories (id, tenant_id, name, is_active)
values ('e4444444-4444-4444-4444-444444444444', 'e3333333-3333-3333-3333-333333333333',
        'Categorie lot4', true);

-- Plat INDISPONIBLE expres: la seule autre policy SELECT d'item_options est
-- anon et bornee aux plats disponibles. C'est lui qui prouve la non-regression
-- de lecture apportee par "Members can read own tenant item options".
insert into public.menu_items (id, tenant_id, category_id, name, price, is_available)
values ('e5555555-5555-5555-5555-555555555555', 'e3333333-3333-3333-3333-333333333333',
        'e4444444-4444-4444-4444-444444444444', 'Plat indisponible', 5000, false);

insert into public.item_options (id, tenant_id, menu_item_id, name_fr)
values ('e6666666-6666-6666-6666-666666666666', 'e3333333-3333-3333-3333-333333333333',
        'e5555555-5555-5555-5555-555555555555', 'Cuisson');

insert into public.table_sessions (id, tenant_id, table_number, status)
values ('e7777777-7777-7777-7777-777777777777', 'e3333333-3333-3333-3333-333333333333',
        '12', 'open');

-- ===========================================================================
-- Le WAITER: il lit, il n ecrit plus
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222"}';

update public.item_options set name_fr = 'pirate'
where id = 'e6666666-6666-6666-6666-666666666666';
select is(
  (select name_fr from public.item_options where id = 'e6666666-6666-6666-6666-666666666666'),
  'Cuisson',
  'lot4: un waiter ne peut PAS modifier une option de plat'
);

update public.table_sessions set status = 'closed'
where id = 'e7777777-7777-7777-7777-777777777777';
select is(
  (select status from public.table_sessions where id = 'e7777777-7777-7777-7777-777777777777'),
  'open',
  'lot4: un waiter ne peut PAS fermer une session de table'
);

select throws_ok(
  $$insert into public.table_sessions (tenant_id, table_number, status)
    values ('e3333333-3333-3333-3333-333333333333', '99', 'open')$$,
  '42501',
  null,
  'lot4: un waiter ne peut PAS ouvrir une session de table'
);

-- Non-regression de LECTURE: l option appartient a un plat INDISPONIBLE, que la
-- policy anon ne rend pas.
select is(
  (select count(*)::int from public.item_options
   where id = 'e6666666-6666-6666-6666-666666666666'),
  1,
  'lot4: un waiter LIT toujours l option d un plat INDISPONIBLE'
);

-- ===========================================================================
-- Le MANAGER: il travaille toujours - une table doit pouvoir se fermer
-- ===========================================================================
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111"}';

update public.table_sessions set status = 'closed'
where id = 'e7777777-7777-7777-7777-777777777777';
select is(
  (select status from public.table_sessions where id = 'e7777777-7777-7777-7777-777777777777'),
  'closed',
  'lot4: un manager FERME toujours une session de table'
);

update public.item_options set name_fr = 'Cuisson revue'
where id = 'e6666666-6666-6666-6666-666666666666';
select is(
  (select name_fr from public.item_options where id = 'e6666666-6666-6666-6666-666666666666'),
  'Cuisson revue',
  'lot4: un manager modifie TOUJOURS une option de plat'
);

select * from finish();
rollback;
