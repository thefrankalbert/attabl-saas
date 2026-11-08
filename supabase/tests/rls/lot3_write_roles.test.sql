-- LOT 3: les ECRITURES restantes exigent un ROLE, pas seulement l appartenance.
--
-- Suite de catalogue_write_roles.test.sql et argent_write_roles.test.sql. Les
-- deux migrations precedentes avaient ferme le catalogue et l argent des
-- commandes; elles laissaient volontairement le reste. Ce test couvre ce reste:
-- les quatre permissions, sur une table representative de chacune.
--
-- CE QUE CE TEST PROUVE, ET POURQUOI AUCUN TEST VITEST NE PEUT LE FAIRE: le
-- refus doit venir des policies RLS, donc de Postgres. Un test applicatif
-- remplace justement la couche qui refuse. Mesure le 2026-11-07 avant
-- correction, sur une base montee sur l instantane du schema de prod plus les
-- cinq migrations posterieures: un employe de role `waiter` a modifie un coupon
-- ET une zone avec son seul compte, en attaquant la base directement.
--
-- Les DEUX sens sont testes, et le second compte autant que le premier:
--   - le waiter ne peut plus ecrire (correction);
--   - le manager ecrit toujours, ET le personnel LIT toujours les lignes que
--     les policies publiques masquent (non-regression). Sur `coupons` et
--     `settings` il n y avait AUCUNE policy SELECT en dehors de la policy ALL
--     retiree; sur `announcements` et `venues` la seule autre ne rend que
--     `is_active = true`. Sans les policies de lecture de compensation, le
--     personnel ne verrait plus ces lignes - donc ne pourrait plus les
--     reactiver.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/lot3_write_roles.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-lot3@test.local', 'x', now(), now()),
  ('c2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-lot3@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('c3333333-3333-3333-3333-333333333333', 'tenant-lot3-roles', 'Tenant Lot 3', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  (gen_random_uuid(), 'c3333333-3333-3333-3333-333333333333',
   'c1111111-1111-1111-1111-111111111111', 'gerant-lot3@test.local', 'manager', true),
  (gen_random_uuid(), 'c3333333-3333-3333-3333-333333333333',
   'c2222222-2222-2222-2222-222222222222', 'serveur-lot3@test.local', 'waiter', true);

-- menu.edit
insert into public.coupons (id, tenant_id, code, discount_type, discount_value)
values ('c4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333',
        'LOT3TEMOIN', 'percentage', 10);

-- Annonce DESACTIVEE expres: c est elle qui prouve la non-regression de lecture
-- (la policy publique ne rend que `is_active = true`).
insert into public.announcements (id, tenant_id, title, is_active)
values ('c5555555-5555-5555-5555-555555555555', 'c3333333-3333-3333-3333-333333333333',
        'Annonce desactivee', false);

-- inventory.edit
insert into public.suppliers (id, tenant_id, name)
values ('c6666666-6666-6666-6666-666666666666', 'c3333333-3333-3333-3333-333333333333',
        'Fournisseur temoin');

-- orders.manage (de l argent)
insert into public.house_accounts (id, tenant_id, name)
values ('c7777777-7777-7777-7777-777777777777', 'c3333333-3333-3333-3333-333333333333',
        'Compte temoin');

-- settings.edit - venue DESACTIVE expres, meme raison que l annonce.
insert into public.venues (id, tenant_id, slug, name, is_active)
values ('c8888888-8888-8888-8888-888888888888', 'c3333333-3333-3333-3333-333333333333',
        'salle-lot3', 'Salle desactivee', false);

insert into public.zones (id, venue_id, tenant_id, name, prefix)
values ('c9999999-9999-9999-9999-999999999999', 'c8888888-8888-8888-8888-888888888888',
        'c3333333-3333-3333-3333-333333333333', 'Terrasse', 'T');

insert into public.settings (id, tenant_id, key, value)
values ('caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c3333333-3333-3333-3333-333333333333',
        'temoin', '"valeur-origine"'::jsonb);

-- ===========================================================================
-- Le WAITER: il lit, il n ecrit plus
-- ===========================================================================
-- RLS ne leve PAS d erreur sur un UPDATE ou un DELETE sans correspondance: elle
-- masque les lignes. On assert donc sur l ETAT OBSERVE apres la tentative, et
-- non sur une exception. Un INSERT refuse, lui, leve bien 42501.
set local role authenticated;
set local request.jwt.claims = '{"sub":"c2222222-2222-2222-2222-222222222222"}';

update public.coupons set discount_value = 99
where id = 'c4444444-4444-4444-4444-444444444444';
select is(
  (select discount_value::int from public.coupons
   where id = 'c4444444-4444-4444-4444-444444444444'),
  10,
  'lot3: un waiter ne peut PAS modifier un coupon'
);

update public.announcements set title = 'pirate'
where id = 'c5555555-5555-5555-5555-555555555555';
select is(
  (select title from public.announcements
   where id = 'c5555555-5555-5555-5555-555555555555'),
  'Annonce desactivee',
  'lot3: un waiter ne peut PAS modifier une annonce'
);

update public.suppliers set name = 'pirate'
where id = 'c6666666-6666-6666-6666-666666666666';
select is(
  (select name from public.suppliers where id = 'c6666666-6666-6666-6666-666666666666'),
  'Fournisseur temoin',
  'lot3: un waiter ne peut PAS modifier un fournisseur'
);

update public.house_accounts set name = 'pirate'
where id = 'c7777777-7777-7777-7777-777777777777';
select is(
  (select name from public.house_accounts
   where id = 'c7777777-7777-7777-7777-777777777777'),
  'Compte temoin',
  'lot3: un waiter ne peut PAS modifier un compte maison (de l argent)'
);

update public.zones set name = 'pirate'
where id = 'c9999999-9999-9999-9999-999999999999';
select is(
  (select name from public.zones where id = 'c9999999-9999-9999-9999-999999999999'),
  'Terrasse',
  'lot3: un waiter ne peut PAS renommer une zone'
);

update public.venues set name = 'pirate'
where id = 'c8888888-8888-8888-8888-888888888888';
select is(
  (select name from public.venues where id = 'c8888888-8888-8888-8888-888888888888'),
  'Salle desactivee',
  'lot3: un waiter ne peut PAS renommer un etablissement'
);

update public.settings set value = '"pirate"'::jsonb
where id = 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select is(
  (select value from public.settings where id = 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '"valeur-origine"'::jsonb,
  'lot3: un waiter ne peut PAS modifier un reglage du restaurant'
);

delete from public.suppliers where id = 'c6666666-6666-6666-6666-666666666666';
select is(
  (select count(*)::int from public.suppliers
   where id = 'c6666666-6666-6666-6666-666666666666'),
  1,
  'lot3: un waiter ne peut PAS supprimer un fournisseur'
);

select throws_ok(
  $$insert into public.coupons (tenant_id, code, discount_type, discount_value)
    values ('c3333333-3333-3333-3333-333333333333', 'PIRATE', 'percentage', 100)$$,
  '42501',
  null,
  'lot3: un waiter ne peut PAS creer un coupon'
);

select throws_ok(
  $$insert into public.house_accounts (tenant_id, name)
    values ('c3333333-3333-3333-3333-333333333333', 'Compte pirate')$$,
  '42501',
  null,
  'lot3: un waiter ne peut PAS ouvrir un compte maison'
);

-- Non-regression de LECTURE. Ces quatre assertions sont la raison d etre des
-- policies "Members can read own tenant ..." de la migration: sans elles, le
-- personnel perdrait la vue sur ces lignes et ne pourrait plus les reactiver.
select is(
  (select count(*)::int from public.coupons
   where id = 'c4444444-4444-4444-4444-444444444444'),
  1,
  'lot3: un waiter LIT toujours un coupon (aucune autre policy SELECT)'
);

select is(
  (select count(*)::int from public.announcements
   where id = 'c5555555-5555-5555-5555-555555555555'),
  1,
  'lot3: un waiter LIT toujours une annonce DESACTIVEE'
);

select is(
  (select count(*)::int from public.venues
   where id = 'c8888888-8888-8888-8888-888888888888'),
  1,
  'lot3: un waiter LIT toujours un etablissement DESACTIVE'
);

select is(
  (select count(*)::int from public.settings
   where id = 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'lot3: un waiter LIT toujours un reglage (aucune autre policy SELECT)'
);

-- ===========================================================================
-- Le MANAGER: il travaille toujours
-- ===========================================================================
set local request.jwt.claims = '{"sub":"c1111111-1111-1111-1111-111111111111"}';

update public.coupons set discount_value = 15
where id = 'c4444444-4444-4444-4444-444444444444';
select is(
  (select discount_value::int from public.coupons
   where id = 'c4444444-4444-4444-4444-444444444444'),
  15,
  'lot3: un manager modifie TOUJOURS un coupon'
);

update public.house_accounts set name = 'Compte gerant'
where id = 'c7777777-7777-7777-7777-777777777777';
select is(
  (select name from public.house_accounts
   where id = 'c7777777-7777-7777-7777-777777777777'),
  'Compte gerant',
  'lot3: un manager modifie TOUJOURS un compte maison'
);

select * from finish();
rollback;
