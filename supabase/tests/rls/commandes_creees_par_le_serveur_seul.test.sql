-- Un employe ne cree plus de commande ni d'article par l'API directe
-- (migration 20261124100200, constat B150, contre-audit 1 point 5).
--
-- Le detournement ferme: un caissier creait une commande a 0 (ou 1) FCFA, y
-- ajoutait 10 000 FCFA de plats, puis la soldait sans rien au registre.
-- Les creations legitimes passent par create_order_with_items en service_role
-- (routes serveur /api/orders et /api/orders/pos): elles continuent.
--
-- Temoin (base construite sans 20261124100200): les refus 1 a 6 echouent
-- (insertions acceptees), et 11 aussi (les deux politiques existent encore);
-- les temoins positifs 7 a 10 passent.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('c8111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-creation@test.local', 'x', now(), now()),
  ('c8222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gerant-creation@test.local', 'x', now(), now()),
  ('c8333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'proprio-creation@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('c8a00000-0000-4000-8000-00000000000a', 'creation-a', 'Creation A', true, 'pro', 'active');

insert into public.admin_users (tenant_id, user_id, email, role, is_active)
values ('c8a00000-0000-4000-8000-00000000000a', 'c8111111-1111-4111-8111-111111111111',
        'caissier-creation@test.local', 'cashier', true),
       ('c8a00000-0000-4000-8000-00000000000a', 'c8222222-2222-4222-8222-222222222222',
        'gerant-creation@test.local', 'manager', true),
       ('c8a00000-0000-4000-8000-00000000000a', 'c8333333-3333-4333-8333-333333333333',
        'proprio-creation@test.local', 'owner', true);

insert into public.categories (id, tenant_id, name)
values ('c8e00000-0000-4000-8000-000000000001', 'c8a00000-0000-4000-8000-00000000000a', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price)
values ('c8f00000-0000-4000-8000-000000000001', 'c8a00000-0000-4000-8000-00000000000a',
        'c8e00000-0000-4000-8000-000000000001', 'Poulet braise', 5000);

-- Une commande ouverte existante, creee par le serveur applicatif.
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, status, payment_status)
values ('c8c00000-0000-4000-8000-000000000001', 'c8a00000-0000-4000-8000-00000000000a',
        'takeaway', 'C-1', 5000, 5000, 'pending', 'pending');

set local role authenticated;

-- (1, 3, 5) Caissier, gerant, proprietaire: plus d'INSERT direct dans orders.
set local request.jwt.claims = '{"sub":"c8111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$insert into public.orders (tenant_id, service_type, order_number, subtotal, total, status, payment_status)
    values ('c8a00000-0000-4000-8000-00000000000a', 'takeaway', 'C-CAISSIER', 0, 0, 'served', 'pending')$$,
  '42501', null, 'caissier: ne cree plus de commande par l API directe');
-- (2) ... ni d'article dans une commande existante.
select throws_ok(
  $$insert into public.order_items (order_id, menu_item_id, quantity, price_at_order, item_name, tenant_id)
    values ('c8c00000-0000-4000-8000-000000000001', 'c8f00000-0000-4000-8000-000000000001', 2, 5000,
            'Poulet braise', 'c8a00000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'caissier: n ajoute plus d article par l API directe');

set local request.jwt.claims = '{"sub":"c8222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$insert into public.orders (tenant_id, service_type, order_number, subtotal, total, status, payment_status)
    values ('c8a00000-0000-4000-8000-00000000000a', 'takeaway', 'C-GERANT', 1, 1, 'served', 'pending')$$,
  '42501', null, 'gerant: ne cree plus de commande par l API directe');
select throws_ok(
  $$insert into public.order_items (order_id, menu_item_id, quantity, price_at_order, item_name, tenant_id)
    values ('c8c00000-0000-4000-8000-000000000001', 'c8f00000-0000-4000-8000-000000000001', 1, 5000,
            'Poulet braise', 'c8a00000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'gerant: n ajoute plus d article par l API directe');

set local request.jwt.claims = '{"sub":"c8333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$insert into public.orders (tenant_id, service_type, order_number, subtotal, total, status, payment_status)
    values ('c8a00000-0000-4000-8000-00000000000a', 'takeaway', 'C-PROPRIO', 0, 0, 'served', 'pending')$$,
  '42501', null, 'proprietaire: ne cree plus de commande par l API directe');
select throws_ok(
  $$insert into public.order_items (order_id, menu_item_id, quantity, price_at_order, item_name, tenant_id)
    values ('c8c00000-0000-4000-8000-000000000001', 'c8f00000-0000-4000-8000-000000000001', 1, 5000,
            'Poulet braise', 'c8a00000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'proprietaire: n ajoute plus d article par l API directe');

-- (7) Temoin positif: un employe lit toujours ses commandes et fait avancer
-- la cuisine (politiques SELECT et UPDATE inchangees).
select lives_ok(
  $$update public.orders set status = 'preparing'
     where id = 'c8c00000-0000-4000-8000-000000000001' and tenant_id = 'c8a00000-0000-4000-8000-00000000000a'$$,
  'proprietaire: faire avancer une commande reste possible');
select is((select status from public.orders where id = 'c8c00000-0000-4000-8000-000000000001'),
  'preparing', 'proprietaire: la commande a REELLEMENT avance');

-- (9) Temoin positif: le serveur applicatif (service_role) cree une commande
-- par create_order_with_items, articles compris.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok(
  $$select public.create_order_with_items(
      p_tenant_id => 'c8a00000-0000-4000-8000-00000000000a',
      p_order_number => 'C-SERVEUR',
      p_total => 5000,
      p_service_type => 'takeaway',
      p_subtotal => 5000,
      p_items => '[{"menu_item_id":"c8f00000-0000-4000-8000-000000000001","item_name":"Poulet braise","quantity":1,"price_at_order":5000}]'::jsonb)$$,
  'service_role: create_order_with_items cree toujours une commande');
reset role;
select is((select count(*)::int from public.order_items oi join public.orders o on o.id = oi.order_id
            where o.order_number = 'C-SERVEUR' and o.tenant_id = 'c8a00000-0000-4000-8000-00000000000a'),
  1, 'service_role: la commande et son article sont REELLEMENT crees');

-- (11) Catalogue: plus aucune politique INSERT sur orders ni order_items.
select is((select count(*)::int from pg_policy
            where polrelid in ('public.orders'::regclass, 'public.order_items'::regclass)
              and polcmd in ('a', '*')),
  0, 'aucune politique INSERT (ni ALL) sur orders et order_items');

select * from finish();
rollback;
