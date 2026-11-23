-- Rapports par espace (migration 20261123100000, lot 4 PR A).
--
-- Chiffres: un restaurant Business a deux espaces actifs (Terrasse, Bar) et un
-- espace actif sans vente (Lobby), plus un espace inactif sans vente (Ancien).
-- - commande T1 sur une table de la Terrasse: 10 000 encaisses puis 2 000
--   rembourses -> Terrasse 8 000, 1 commande;
-- - commande B1 dont orders.venue_id = Bar (sans table): 6 000, 1 commande;
-- - commande B2 sur une table de la Terrasse MAIS orders.venue_id = Bar:
--   orders.venue_id prime -> Bar 6 000 + 4 000 = 10 000, 2 commandes;
-- - commande E1 a emporter (sans table ni espace): 3 000 -> ligne sans espace.
-- Total du registre: 8 000 + 10 000 + 3 000 = 21 000, 4 commandes.
--
-- Verrous: Starter et Pro refuses (42501) sur les deux fonctions, alors que le
-- meme membre Pro lit bien get_order_summary (temoin: le refus vient du plan,
-- pas de l'appartenance). L'essai actif (plan choisi Pro) passe comme Business.
-- Un membre d'un autre restaurant est refuse, anon n'execute rien.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'biz@test.local', 'x', now(), now()),
  ('e1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pro@test.local', 'x', now(), now()),
  ('e1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'starter@test.local', 'x', now(), now()),
  ('e1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'essai@test.local', 'x', now(), now()),
  ('e1000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ent@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status, trial_ends_at)
values
  ('e2000000-0000-4000-8000-000000000001', 'esp-biz', 'Biz', true, 'business', 'active', null),
  ('e2000000-0000-4000-8000-000000000002', 'esp-pro', 'Pro', true, 'pro', 'active', null),
  ('e2000000-0000-4000-8000-000000000003', 'esp-starter', 'Starter', true, 'starter', 'active', null),
  ('e2000000-0000-4000-8000-000000000004', 'esp-essai', 'Essai', true, 'pro', 'trial', now() + interval '5 days'),
  ('e2000000-0000-4000-8000-000000000005', 'esp-ent', 'Ent', true, 'enterprise', 'active', null);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
   'e1000000-0000-4000-8000-000000000001', 'biz@test.local', 'owner', true),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000002',
   'e1000000-0000-4000-8000-000000000002', 'pro@test.local', 'owner', true),
  ('e3000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000003',
   'e1000000-0000-4000-8000-000000000003', 'starter@test.local', 'owner', true),
  ('e3000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000004',
   'e1000000-0000-4000-8000-000000000004', 'essai@test.local', 'owner', true),
  ('e3000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000005',
   'e1000000-0000-4000-8000-000000000005', 'ent@test.local', 'owner', true);

insert into public.venues (id, tenant_id, slug, name, is_active)
values
  ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'terrasse', 'Terrasse', true),
  ('e4000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'bar', 'Bar', true),
  ('e4000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'lobby', 'Lobby', true),
  ('e4000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'ancien', 'Ancien', false);

insert into public.zones (id, venue_id, tenant_id, name, prefix)
values ('e5000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001', 'Terrasse', 'T');
insert into public.tables (id, zone_id, tenant_id, table_number, display_name)
values ('e6000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001', 'T1', 'Table T1');

insert into public.categories (id, tenant_id, name)
values ('e7000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price)
values
  ('e8000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000001', 'Poulet DG', 5000),
  ('e8000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000001', 'Jus', 1000);

insert into public.orders (id, tenant_id, venue_id, table_id, order_number, subtotal, total,
                           status, payment_status, paid_at)
values
  ('e9000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', null,
   'e6000000-0000-4000-8000-000000000001', 'ESP-T1', 10000, 10000, 'served', 'partial', now()),
  ('e9000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-000000000002', null, 'ESP-B1', 6000, 6000, 'served', 'paid', now()),
  ('e9000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000001',
   'ESP-B2', 4000, 4000, 'served', 'paid', now()),
  ('e9000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', null, null,
   'ESP-E1', 3000, 3000, 'served', 'paid', now());

insert into public.order_items (tenant_id, order_id, menu_item_id, item_name, price_at_order, quantity)
values
  -- Terrasse: 2 Poulet, 0 jus.
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001',
   'e8000000-0000-4000-8000-000000000001', 'Poulet DG', 5000, 2),
  -- Bar: 1 Poulet, 6 jus -> le jus est la meilleure vente du Bar.
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002',
   'e8000000-0000-4000-8000-000000000001', 'Poulet DG', 5000, 1),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002',
   'e8000000-0000-4000-8000-000000000002', 'Jus', 1000, 1),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003',
   'e8000000-0000-4000-8000-000000000002', 'Jus', 1000, 5),
  -- Sans espace: 3 jus.
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000004',
   'e8000000-0000-4000-8000-000000000002', 'Jus', 1000, 3);

insert into public.payments (tenant_id, order_id, amount, method, status)
values
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 10000, 'cash', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 2000, 'cash', 'refunded'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 6000, 'card', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003', 4000, 'cash', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000004', 3000, 'cash', 'completed');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001"}';

create temp table r as
  select * from public.get_venue_report('e2000000-0000-4000-8000-000000000001',
    now() - interval '1 day', now() + interval '1 minute');
create temp table s as
  select * from public.get_order_summary('e2000000-0000-4000-8000-000000000001',
    now() - interval '1 day', now() + interval '1 minute');

select is((select revenue from r where venue_name = 'Terrasse'), 8000::bigint,
  'Terrasse: encaisse moins rembourse, par la zone de la table');
select is((select order_count from r where venue_name = 'Terrasse'), 1::bigint,
  'Terrasse: une commande');
select is((select revenue from r where venue_name = 'Bar'), 10000::bigint,
  'Bar: orders.venue_id prime sur la table');
select is((select order_count from r where venue_name = 'Bar'), 2::bigint, 'Bar: deux commandes');
select is((select avg_basket from r where venue_name = 'Bar'), 5000::bigint, 'Bar: ticket moyen');
select is((select revenue from r where venue_id is null), 3000::bigint,
  'commande sans table ni espace: ligne sans espace');
select is((select revenue from r where venue_name = 'Lobby'), 0::bigint,
  'espace actif sans vente: present a zero');
select is((select count(*)::int from r where venue_name = 'Ancien'), 0,
  'espace inactif sans vente: absent');
select is((select sum(revenue)::numeric from r), (select total_revenue from s),
  'somme des espaces = chiffre du restaurant (get_order_summary)');
select is((select sum(order_count)::bigint from r), (select total_orders from s),
  'somme des commandes = commandes du restaurant');

select is(
  (select item_name from public.get_venue_top_items('e2000000-0000-4000-8000-000000000001',
     now() - interval '1 day', now() + interval '1 minute', 1)
   where venue_id = 'e4000000-0000-4000-8000-000000000002'),
  'Jus', 'Bar: meilleure vente = Jus (6)');
select is(
  (select count(*)::int from public.get_venue_top_items('e2000000-0000-4000-8000-000000000001',
     now() - interval '1 day', now() + interval '1 minute', 1)),
  3, 'p_limit = 1: un plat par espace vendeur (Terrasse, Bar, sans espace)');

-- Enterprise passe.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000005"}';
select lives_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000005', now() - interval '1 day', now())$$,
  'Enterprise: autorise');

-- Essai actif (plan choisi Pro): l'essai donne Business.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000004"}';
select lives_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000004', now() - interval '1 day', now())$$,
  'essai actif: autorise comme Business');

-- Pro: refuse. Temoin: le meme membre lit les rapports Pro.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002"}';
select lives_ok(
  $$select * from public.get_order_summary('e2000000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  'temoin: le membre Pro lit les rapports Pro');
select throws_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  '42501', null, 'Pro: rapport par espace refuse');
select throws_ok(
  $$select * from public.get_venue_top_items('e2000000-0000-4000-8000-000000000002', now() - interval '1 day', now(), 5)$$,
  '42501', null, 'Pro: meilleures ventes par espace refusees');

-- Starter: refuse.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003"}';
select throws_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000003', now() - interval '1 day', now())$$,
  '42501', null, 'Starter: rapport par espace refuse');
select throws_ok(
  $$select * from public.get_venue_top_items('e2000000-0000-4000-8000-000000000003', now() - interval '1 day', now(), 5)$$,
  '42501', null, 'Starter: meilleures ventes par espace refusees');

-- Membre d'un autre restaurant (Starter) sur le restaurant Business: refuse.
select throws_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  '42501', null, 'autre restaurant: refuse');

reset role;
select is(has_function_privilege('anon',
  'public.get_venue_report(uuid, timestamptz, timestamptz)', 'EXECUTE'),
  false, 'anon n execute pas get_venue_report');
select is(has_function_privilege('anon',
  'public.get_venue_top_items(uuid, timestamptz, timestamptz, integer)', 'EXECUTE'),
  false, 'anon n execute pas get_venue_top_items');

select * from finish();
rollback;
