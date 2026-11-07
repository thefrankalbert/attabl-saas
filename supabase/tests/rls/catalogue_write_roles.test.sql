-- Les ECRITURES du catalogue exigent un ROLE, pas seulement l appartenance.
--
-- CE QUE CE TEST PROUVE, ET POURQUOI AUCUN TEST VITEST NE PEUT LE FAIRE: le
-- refus doit venir des policies RLS, donc de Postgres. Un test applicatif
-- remplace justement la couche qui refuse. Mesure le 2026-11-07 avant
-- correction: un employe de role `waiter`, avec la seule cle anon du bundle et
-- son propre compte, a fait passer un plat de 10 000 a 1,00 en attaquant
-- PostgREST directement - les gardes de role vivaient uniquement dans les
-- Server Actions, et une Server Action ne garde pas PostgREST.
--
-- Les DEUX sens sont testes, et le second compte autant que le premier:
--   - le waiter ne peut plus ecrire (correction);
--   - le manager ecrit toujours, ET LIT toujours les lignes desactivees
--     (non-regression: les policies publiques filtrent `is_active = true`, donc
--     sans une policy de lecture pour les membres, on ne pourrait plus voir une
--     categorie desactivee - donc plus la reactiver).
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/catalogue_write_roles.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant@test.local', 'x', now(), now()),
  ('a2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('a3333333-3333-3333-3333-333333333333', 'tenant-catalogue-roles', 'Tenant Catalogue', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  (gen_random_uuid(), 'a3333333-3333-3333-3333-333333333333',
   'a1111111-1111-1111-1111-111111111111', 'gerant@test.local', 'manager', true),
  (gen_random_uuid(), 'a3333333-3333-3333-3333-333333333333',
   'a2222222-2222-2222-2222-222222222222', 'serveur@test.local', 'waiter', true);

-- Une categorie DESACTIVEE expres: c est elle qui prouve la non-regression de
-- lecture (la policy publique ne rend que `is_active = true`).
insert into public.categories (id, tenant_id, name, is_active)
values ('a4444444-4444-4444-4444-444444444444', 'a3333333-3333-3333-3333-333333333333',
        'Categorie desactivee', false);

insert into public.menu_items (id, tenant_id, category_id, name, price, is_available)
values ('a5555555-5555-5555-5555-555555555555', 'a3333333-3333-3333-3333-333333333333',
        'a4444444-4444-4444-4444-444444444444', 'Plat temoin', 10000, true);

insert into public.menus (id, tenant_id, name, slug, is_active)
values ('a6666666-6666-6666-6666-666666666666', 'a3333333-3333-3333-3333-333333333333',
        'Menu temoin', 'menu-temoin', true);

-- `tables` exige une zone, qui exige un venue: les colonnes obligatoires ont
-- ete relevees sur la base, pas devinees (table_number et display_name, pas
-- `number`).
insert into public.venues (id, tenant_id, slug, name, is_active)
values ('a8888888-8888-8888-8888-888888888888', 'a3333333-3333-3333-3333-333333333333',
        'salle-principale', 'Salle principale', true);

insert into public.zones (id, venue_id, tenant_id, name, prefix)
values ('a9999999-9999-9999-9999-999999999999', 'a8888888-8888-8888-8888-888888888888',
        'a3333333-3333-3333-3333-333333333333', 'Terrasse', 'T');

insert into public.tables (id, zone_id, tenant_id, table_number, display_name, capacity, is_active)
values ('a7777777-7777-7777-7777-777777777777', 'a9999999-9999-9999-9999-999999999999',
        'a3333333-3333-3333-3333-333333333333', '42', 'T42', 4, true);

-- ===========================================================================
-- Le WAITER: il lit, il n ecrit plus
-- ===========================================================================
-- RLS ne leve PAS d erreur sur un UPDATE ou un DELETE sans correspondance: elle
-- masque les lignes. On assert donc sur l ETAT OBSERVE apres la tentative, et
-- non sur une exception - et pas davantage sur un compte de lignes dans une
-- sous-requete, qu une CTE modifiante ne peut pas porter (erreur 0A000).
-- Un INSERT refuse, lui, leve bien 42501.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222"}';

update public.menu_items set price = 1 where id = 'a5555555-5555-5555-5555-555555555555';
select is(
  (select price::int from public.menu_items where id = 'a5555555-5555-5555-5555-555555555555'),
  10000,
  'catalogue: un waiter ne peut PAS modifier le prix d un plat'
);

update public.categories set name = 'pirate' where id = 'a4444444-4444-4444-4444-444444444444';
select is(
  (select name from public.categories where id = 'a4444444-4444-4444-4444-444444444444'),
  'Categorie desactivee',
  'catalogue: un waiter ne peut PAS renommer une categorie'
);

update public.menus set name = 'pirate' where id = 'a6666666-6666-6666-6666-666666666666';
select is(
  (select name from public.menus where id = 'a6666666-6666-6666-6666-666666666666'),
  'Menu temoin',
  'catalogue: un waiter ne peut PAS renommer un menu'
);

update public.tables set capacity = 99 where id = 'a7777777-7777-7777-7777-777777777777';
select is(
  (select capacity from public.tables where id = 'a7777777-7777-7777-7777-777777777777'),
  4,
  'catalogue: un waiter ne peut PAS modifier une table'
);

delete from public.menu_items where id = 'a5555555-5555-5555-5555-555555555555';
select is(
  (select count(*)::int from public.menu_items where id = 'a5555555-5555-5555-5555-555555555555'),
  1,
  'catalogue: un waiter ne peut PAS supprimer un plat'
);

select throws_ok(
  $$insert into public.menus (tenant_id, name, slug, is_active)
    values ('a3333333-3333-3333-3333-333333333333', 'Menu pirate', 'menu-pirate', true)$$,
  '42501',
  null,
  'catalogue: un waiter ne peut PAS creer un menu'
);

-- Non-regression de LECTURE: le service a besoin du catalogue complet, lignes
-- desactivees comprises. Les policies publiques ne rendent que `is_active`.
select is(
  (select count(*)::int from public.categories where id = 'a4444444-4444-4444-4444-444444444444'),
  1,
  'catalogue: un waiter LIT toujours une categorie desactivee'
);

-- ===========================================================================
-- Le MANAGER: il travaille toujours
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111"}';

update public.menu_items set price = 12000 where id = 'a5555555-5555-5555-5555-555555555555';
select is(
  (select price::int from public.menu_items where id = 'a5555555-5555-5555-5555-555555555555'),
  12000,
  'catalogue non-regression: un manager modifie le prix d un plat'
);

-- Le geste que la migration aurait casse si elle avait retire la lecture: on ne
-- reactive que ce que l on voit.
update public.categories set is_active = true where id = 'a4444444-4444-4444-4444-444444444444';
select is(
  (select is_active from public.categories where id = 'a4444444-4444-4444-4444-444444444444'),
  true,
  'catalogue non-regression: un manager REACTIVE une categorie desactivee'
);

update public.tables set capacity = 6 where id = 'a7777777-7777-7777-7777-777777777777';
select is(
  (select capacity from public.tables where id = 'a7777777-7777-7777-7777-777777777777'),
  6,
  'catalogue non-regression: un manager modifie une table'
);

select lives_ok(
  $$insert into public.menus (tenant_id, name, slug, is_active)
    values ('a3333333-3333-3333-3333-333333333333', 'Nouveau menu', 'nouveau-menu', true)$$,
  'catalogue non-regression: un manager cree un menu'
);

-- ===========================================================================
-- PARITE AVEC L'APPLICATION: une permission RETIREE doit mordre en base aussi
-- ===========================================================================
-- L'application resout une permission sur trois niveaux. Verifier le seul role
-- laissait un gerant a qui `menu.edit` a ete RETIRE ecrire en base, alors que
-- l'application le refuse. Les deux niveaux presents en base sont donc lus.
reset role;

-- Niveau 1: permission individuelle retiree a CE gerant.
update public.admin_users
   set custom_permissions = '{"menu.edit": false}'::jsonb
 where user_id = 'a1111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111"}';

update public.menu_items set price = 777 where id = 'a5555555-5555-5555-5555-555555555555';
select is(
  (select price::int from public.menu_items where id = 'a5555555-5555-5555-5555-555555555555'),
  12000,
  'parite: un manager dont menu.edit est RETIRE ne peut plus modifier un prix'
);

-- Niveau 2: permission rendue a l'individu, mais retiree au ROLE pour ce
-- tenant. Le niveau 1 gagne, exactement comme dans hasPermission.
reset role;
update public.admin_users
   set custom_permissions = '{"menu.edit": true}'::jsonb
 where user_id = 'a1111111-1111-1111-1111-111111111111';
insert into public.role_permissions (tenant_id, role, permissions)
values ('a3333333-3333-3333-3333-333333333333', 'manager', '{"menu.edit": false}'::jsonb);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111"}';

update public.menu_items set price = 888 where id = 'a5555555-5555-5555-5555-555555555555';
select is(
  (select price::int from public.menu_items where id = 'a5555555-5555-5555-5555-555555555555'),
  888,
  'parite: la permission individuelle (true) bat le refus pose sur le role'
);

-- Et l'inverse: sans permission individuelle, le refus du ROLE mord.
reset role;
update public.admin_users set custom_permissions = null
 where user_id = 'a1111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111"}';

update public.menu_items set price = 999 where id = 'a5555555-5555-5555-5555-555555555555';
select is(
  (select price::int from public.menu_items where id = 'a5555555-5555-5555-5555-555555555555'),
  888,
  'parite: un refus pose sur le ROLE du tenant mord sans permission individuelle'
);

select * from finish();
rollback;
