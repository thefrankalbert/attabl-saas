-- La DELEGATION ne porte pas sur les commandes - et l'argent reste au gerant.
--
-- POURQUOI CE TEST EXISTE, ET POURQUOI IL A CHANGE DE PREMISE. 20261107170000
-- a rendu la garde d'ecriture sensible aux delegations du proprietaire, ce qui
-- reparait une fonctionnalite inoperante (un chef ne pouvait pas gerer ses
-- stocks). Mais une delegation de `orders.manage` ouvrait un ecart que
-- l'application n'a jamais permis: elle separe l'argent du reste par le ROLE
-- (ORDER_MONEY_ROLES, owner/admin/manager), pas par la permission.
--
-- Trois migrations ont ferme les chemins un par un (montant negatif, statut
-- 'refunded', offert a l'insertion, suppression d'une note). La revue a trouve
-- un chemin de plus, et celui-la ne se ferme PAS par une policy: la garde
-- argent verifie le LIBELLE d'une commande (`payment_status`, `is_comp`), pas
-- ses MONTANTS. Un caissier delegue pouvait mettre `total = 0` sur une note et
-- l'encaisser. Une policy ne peut pas lire les colonnes modifiees.
--
-- 20261107210000 tranche donc a la racine: `orders.manage` ne s'obtient JAMAIS
-- par delegation. Ce que ce test prouve maintenant:
--   1. la classe entiere est fermee - un caissier delegue n'ecrit pas sur les
--      commandes, donc aucun chemin argent ne lui est atteignable;
--   2. la delegation reste PLEINEMENT fonctionnelle ailleurs - le chef et ses
--      stocks, le cas qui motivait 20261107170000;
--   3. un RETRAIT explicite retire toujours - sans quoi le resserrage aurait
--      reintroduit un gerant qu'on avait volontairement limite;
--   4. le gerant garde toute son autorite - un test qui ne verifierait que les
--      refus laisserait passer un correctif qui bloque la caisse.
--
-- Les gardes argent de 20261107190000 et 20261107200000 restent en place. Sous
-- ce resserrage elles ne sont plus le seul rempart (autorite argent et
-- `orders.manage` deviennent equivalentes pour tous les roles), mais elles
-- valent comme defense en profondeur: le jour ou la delegation de
-- `orders.manage` sera ouverte volontairement, elles seront deja la.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/garde_argent.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('b1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-delegue@test.local', 'x', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-argent@test.local', 'x', now(), now()),
  ('b7777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'chef-delegue@test.local', 'x', now(), now()),
  ('b8888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-limite@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('b3333333-3333-3333-3333-333333333333', 'tenant-argent', 'Tenant Argent', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b1111111-1111-1111-1111-111111111111', 'caissier-delegue@test.local', 'cashier', true, null),
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b2222222-2222-2222-2222-222222222222', 'gerant-argent@test.local', 'manager', true, null),
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b7777777-7777-7777-7777-777777777777', 'chef-delegue@test.local', 'chef', true, null),
  -- Gerant a qui le proprietaire a explicitement RETIRE la gestion des
  -- commandes. Sans le bloc de retrait de 20261107210000, le resserrage le
  -- ferait repasser: il est admin/manager, donc la branche de role suffirait.
  (gen_random_uuid(), 'b3333333-3333-3333-3333-333333333333',
   'b8888888-8888-8888-8888-888888888888', 'gerant-limite@test.local', 'manager', true,
   '{"orders.manage": false}'::jsonb);

-- Le proprietaire delegue TOUT ce qu'il peut deleguer. C'est tout l'interet du
-- cas: la delegation EXISTE et doit malgre tout rester sans effet sur les
-- commandes, tout en restant pleinement effective sur les stocks.
insert into public.role_permissions (tenant_id, role, permissions)
values
  ('b3333333-3333-3333-3333-333333333333', 'cashier', '{"orders.manage": true}'::jsonb),
  ('b3333333-3333-3333-3333-333333333333', 'chef',
   '{"inventory.edit": true, "orders.manage": true}'::jsonb);

insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status)
values ('b4444444-4444-4444-4444-444444444444', 'b3333333-3333-3333-3333-333333333333',
        'CMD-ARGENT-1', 10000, 10000, 'preparing', 'pending');

insert into public.house_accounts (id, tenant_id, name)
values ('b5555555-5555-5555-5555-555555555555', 'b3333333-3333-3333-3333-333333333333',
        'Compte temoin');

-- Commande dediee aux assertions de SUPPRESSION: refusee au caissier, puis
-- reussie au gerant. Elle a sa propre ligne expres - si une garde DELETE
-- regresse, la suppression reussit, et une assertion qui aurait partage la
-- commande principale la ferait disparaitre: toutes les assertions suivantes
-- tomberaient en cascade, pour une cause qui n'est pas la leur. Mesure faite:
-- c'est exactement ce qui s'est produit a la premiere ecriture de ce test.
insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status)
values ('b6666666-6666-6666-6666-666666666666', 'b3333333-3333-3333-3333-333333333333',
        'CMD-A-SUPPRIMER', 7000, 7000, 'preparing', 'pending');

-- ===========================================================================
-- 1. Un caissier DELEGUE n'ecrit PAS sur les commandes
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111"}';

-- Ce refus MASQUE la ligne au lieu de lever: le USING de la policy UPDATE
-- echoue, et un USING qui ne correspond pas rend zero ligne sans erreur. On
-- assert donc sur l'etat observe, pas sur une exception.
update public.orders set status = 'ready'
where id = 'b4444444-4444-4444-4444-444444444444';
select is(
  (select status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'preparing',
  'delegation: un caissier delegue ne fait PAS avancer une commande'
);

-- L'INSERT n'a pas de USING: un WITH CHECK viole leve bien 42501.
select throws_ok(
  $$insert into public.orders (tenant_id, order_number, subtotal, total, payment_status)
    values ('b3333333-3333-3333-3333-333333333333', 'CMD-PIRATE', 9000, 9000, 'pending')$$,
  '42501',
  null,
  'delegation: un caissier delegue ne CREE PAS de commande'
);

-- La policy payments exige `orders.manage` en PREMIER conjoint, avant meme de
-- regarder le signe ou le statut. Un encaissement ordinaire est donc refuse
-- lui aussi: c'est ce que ce resserrage coute, et il faut le voir.
select throws_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('b3333333-3333-3333-3333-333333333333',
            'b4444444-4444-4444-4444-444444444444', 10000, 'cash', 'completed')$$,
  '42501',
  null,
  'delegation: un caissier delegue n ENCAISSE PAS, meme un tender positif'
);

delete from public.orders where id = 'b6666666-6666-6666-6666-666666666666';
select is(
  (select count(*)::int from public.orders where id = 'b6666666-6666-6666-6666-666666666666'),
  1,
  'delegation: un caissier delegue ne SUPPRIME PAS une commande'
);

select throws_ok(
  $$insert into public.house_accounts (tenant_id, name)
    values ('b3333333-3333-3333-3333-333333333333', 'Compte pirate')$$,
  '42501',
  null,
  'argent: un caissier delegue n OUVRE PAS de compte maison'
);

update public.house_accounts set name = 'pirate'
where id = 'b5555555-5555-5555-5555-555555555555';
select is(
  (select name from public.house_accounts where id = 'b5555555-5555-5555-5555-555555555555'),
  'Compte temoin',
  'argent: un caissier delegue ne MODIFIE PAS un compte maison'
);

select ok(
  NOT public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'orders.manage'),
  'garde: la delegation n accorde pas orders.manage a un caissier'
);

select ok(
  NOT public.has_tenant_money_permission('b3333333-3333-3333-3333-333333333333'),
  'garde: un caissier delegue n a aucune autorite argent'
);

-- ===========================================================================
-- 2. La delegation reste PLEINEMENT fonctionnelle ailleurs
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b7777777-7777-7777-7777-777777777777"}';

select ok(
  public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'inventory.edit'),
  'delegation: un chef a qui on accorde inventory.edit gere bien ses stocks'
);

select ok(
  NOT public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'orders.manage'),
  'delegation: le meme chef n obtient PAS orders.manage, meme delegue'
);

-- ===========================================================================
-- 3. Un RETRAIT explicite retire toujours
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b8888888-8888-8888-8888-888888888888"}';

select ok(
  NOT public.has_tenant_write_permission('b3333333-3333-3333-3333-333333333333', 'orders.manage'),
  'retrait: un gerant a qui on RETIRE orders.manage reste refuse'
);

select ok(
  NOT public.has_tenant_money_permission('b3333333-3333-3333-3333-333333333333'),
  'retrait: ce gerant perd aussi l autorite argent'
);

-- ===========================================================================
-- 4. Le GERANT ordinaire garde TOUTE son autorite
-- ===========================================================================
set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222"}';

update public.orders set status = 'ready'
where id = 'b4444444-4444-4444-4444-444444444444';
select is(
  (select status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'ready',
  'gerant: fait avancer une commande'
);

select lives_ok(
  $$insert into public.payments (tenant_id, order_id, amount, method, status)
    values ('b3333333-3333-3333-3333-333333333333',
            'b4444444-4444-4444-4444-444444444444', 10000, 'cash', 'completed')$$,
  'gerant: encaisse un tender'
);

update public.orders set payment_status = 'comp', is_comp = true
where id = 'b4444444-4444-4444-4444-444444444444';
select is(
  (select payment_status from public.orders where id = 'b4444444-4444-4444-4444-444444444444'),
  'comp',
  'gerant: OFFRE toujours une commande'
);

delete from public.orders where id = 'b6666666-6666-6666-6666-666666666666';
select is(
  (select count(*)::int from public.orders where id = 'b6666666-6666-6666-6666-666666666666'),
  0,
  'gerant: SUPPRIME toujours une commande'
);

select * from finish();
rollback;
