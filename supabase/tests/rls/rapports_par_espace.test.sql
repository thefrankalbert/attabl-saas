-- Rapports par espace (migration 20261123120000, lot 4 PR A).
--
-- Chiffres: un restaurant Business a trois espaces actifs (Terrasse, Bar,
-- Lobby sans vente), un espace inactif qui a vendu (Ancien) et un espace
-- inactif sans vente (Ferme).
-- - T1 sur une table de la Terrasse, sans espace fourni: le declencheur
--   inscrit la Terrasse. 10 000 encaisses puis 2 000 rembourses -> 8 000;
-- - B1 avec orders.venue_id = Bar (sans table): 6 000;
-- - B2 sur une table de la Terrasse MAIS orders.venue_id = Bar: l'espace
--   fourni est garde -> Bar 6 000 + 4 000 = 10 000, 2 commandes;
-- - A1 dans l'espace inactif Ancien: 1 000;
-- - E1 a emporter (sans table ni espace): 3 000 -> ligne sans espace;
-- - X1 avec un espace d'un AUTRE restaurant: 500 -> ligne sans espace.
-- - L1, ancienne commande (espace vide) sur une autre table de la Terrasse: 700.
-- Total du registre: 8 700 + 10 000 + 1 000 + 3 500 = 23 200, 7 commandes.
--
-- Verrous: Starter et Pro refuses (42501) sur les deux fonctions, alors que le
-- meme membre Pro lit get_order_summary (temoin: le refus vient du plan, pas
-- de l'appartenance). Essai expire et restaurant gele refuses, essai actif
-- accepte. Droit reports.view en base: serveur refuse (aussi sur les rapports
-- de ventes Pro), gerant accepte, caissier a qui le proprietaire a donne le
-- droit accepte. Un non-membre est refuse sur l'appartenance, sans rien
-- apprendre du plan. anon n'execute rien.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(41);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('e1000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'esp' || n || '@test.local', 'x', now(), now()
from generate_series(1, 9) n;

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status, trial_ends_at)
values
  ('e2000000-0000-4000-8000-000000000001', 'esp-biz', 'Biz', true, 'business', 'active', null),
  ('e2000000-0000-4000-8000-000000000002', 'esp-pro', 'Pro', true, 'pro', 'active', null),
  ('e2000000-0000-4000-8000-000000000003', 'esp-starter', 'Starter', true, 'starter', 'active', null),
  ('e2000000-0000-4000-8000-000000000004', 'esp-essai', 'Essai', true, 'pro', 'trial', now() + interval '5 days'),
  ('e2000000-0000-4000-8000-000000000005', 'esp-ent', 'Ent', true, 'enterprise', 'active', null),
  ('e2000000-0000-4000-8000-000000000006', 'esp-gele', 'Gele', false, 'business', 'frozen', null),
  ('e2000000-0000-4000-8000-000000000007', 'esp-fini', 'Fini', true, 'business', 'trial', now() - interval '1 day');

-- e1..1 owner Biz, ..2 owner Pro, ..3 owner Starter, ..4 owner essai, ..5 owner
-- Ent, ..6 owner gele, ..7 owner essai fini, ..8 serveur Biz, ..9 caissier Biz
-- a qui le proprietaire a donne reports.view.
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
select ('e3000000-0000-4000-8000-00000000000' || n)::uuid,
       ('e2000000-0000-4000-8000-00000000000' || least(n, 7))::uuid,
       ('e1000000-0000-4000-8000-00000000000' || n)::uuid,
       'esp' || n || '@test.local', 'owner', true, null::jsonb
from generate_series(1, 7) n;
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  ('e3000000-0000-4000-8000-000000000008', 'e2000000-0000-4000-8000-000000000001',
   'e1000000-0000-4000-8000-000000000008', 'esp8@test.local', 'waiter', true, null),
  ('e3000000-0000-4000-8000-000000000009', 'e2000000-0000-4000-8000-000000000001',
   'e1000000-0000-4000-8000-000000000009', 'esp9@test.local', 'cashier', true, '{"reports.view": true}');

insert into public.venues (id, tenant_id, slug, name, is_active)
values
  ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'terrasse', 'Terrasse', true),
  ('e4000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'bar', 'Bar', true),
  ('e4000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'lobby', 'Lobby', true),
  ('e4000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'ancien', 'Ancien', false),
  ('e4000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', 'ferme', 'Ferme', false),
  ('e4000000-0000-4000-8000-000000000009', 'e2000000-0000-4000-8000-000000000005', 'voisin', 'Voisin', true);

insert into public.zones (id, venue_id, tenant_id, name, prefix)
values
  ('e5000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001',
   'e2000000-0000-4000-8000-000000000001', 'Terrasse', 'T'),
  ('e5000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-000000000002',
   'e2000000-0000-4000-8000-000000000001', 'Bar', 'B');
insert into public.tables (id, zone_id, tenant_id, table_number, display_name)
values ('e6000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001', 'T1', 'Table T1'),
       ('e6000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001', 'T2', 'Table T2');

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
   'ESP-E1', 3000, 3000, 'served', 'paid', now()),
  ('e9000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-000000000004', null, 'ESP-A1', 1000, 1000, 'served', 'paid', now()),
  ('e9000000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000001',
   'e4000000-0000-4000-8000-000000000009', null, 'ESP-X1', 500, 500, 'served', 'paid', now()),
  ('e9000000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000001', null,
   'e6000000-0000-4000-8000-000000000002', 'ESP-L1', 700, 700, 'served', 'paid', now()),
  -- D1: payee le 10 janvier a 23 h 30 UTC, soit le 11 a 0 h 30 a Douala.
  ('e9000000-0000-4000-8000-000000000008', 'e2000000-0000-4000-8000-000000000001', null, null,
   'ESP-D1', 900, 900, 'served', 'paid', '2026-01-10 23:30+00');
-- L1 simule une commande ANTERIEURE a la migration (espace vide): les rapports
-- la rangent par la zone de sa table (Terrasse).
update public.orders set venue_id = null where id = 'e9000000-0000-4000-8000-000000000007';

insert into public.order_items (tenant_id, order_id, menu_item_id, item_name, price_at_order, quantity)
values
  -- Terrasse: 2 Poulet.
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
   'e8000000-0000-4000-8000-000000000002', 'Jus', 1000, 3),
  -- Ancien: 1 jus.
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000005',
   'e8000000-0000-4000-8000-000000000002', 'Jus', 1000, 1);

insert into public.payments (tenant_id, order_id, amount, method, status)
values
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 10000, 'cash', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 2000, 'cash', 'refunded'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 6000, 'card', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003', 4000, 'cash', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000004', 3000, 'cash', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000005', 1000, 'cash', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000006', 500, 'cash', 'completed'),
  ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000007', 700, 'cash', 'completed');
insert into public.payments (tenant_id, order_id, amount, method, status, created_at)
values ('e2000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000008', 900, 'cash', 'completed', '2026-01-10 23:30+00');

-- Declencheur: l'espace de la table est inscrit sur la commande.
select is((select venue_id from public.orders where id = 'e9000000-0000-4000-8000-000000000001'),
  'e4000000-0000-4000-8000-000000000001'::uuid, 'declencheur: la commande prend l espace de sa table');
select is((select venue_id from public.orders where id = 'e9000000-0000-4000-8000-000000000003'),
  'e4000000-0000-4000-8000-000000000002'::uuid, 'declencheur: un espace fourni est garde');

-- Historique stable: deplacer ensuite la table au Bar ne reecrit pas le passe.
update public.tables set zone_id = 'e5000000-0000-4000-8000-000000000002'
 where id = 'e6000000-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001"}';

create temp table r as
  select * from public.get_venue_report('e2000000-0000-4000-8000-000000000001',
    now() - interval '1 day', now() + interval '1 minute');
create temp table s as
  select * from public.get_order_summary('e2000000-0000-4000-8000-000000000001',
    now() - interval '1 day', now() + interval '1 minute');

select is((select revenue from r where venue_name = 'Terrasse'), 8700::bigint,
  'Terrasse: T1 encaisse moins rembourse malgre le deplacement de sa table, plus L1 ancienne commande');
select is((select order_count from r where venue_name = 'Terrasse'), 2::bigint,
  'Terrasse: deux commandes (dont l ancienne, rangee par sa table)');
select is((select revenue from r where venue_name = 'Bar'), 10000::bigint, 'Bar: espace fourni garde');
select is((select order_count from r where venue_name = 'Bar'), 2::bigint, 'Bar: deux commandes');
select is((select avg_basket from r where venue_name = 'Bar'), 5000::bigint, 'Bar: ticket moyen');
select is((select revenue from r where venue_name = 'Ancien'), 1000::bigint,
  'espace inactif qui a vendu: present');
select is((select count(*)::int from r where venue_name = 'Ferme'), 0, 'espace inactif sans vente: absent');
select is((select revenue from r where venue_name = 'Lobby'), 0::bigint, 'espace actif sans vente: present a zero');
select is((select revenue from r where venue_id is null), 3500::bigint,
  'sans espace: a emporter + espace d un autre restaurant');
select is((select count(*)::int from r where venue_name = 'Voisin'), 0,
  'l espace d un autre restaurant n apparait jamais');
select is((select sum(revenue)::numeric from r), (select total_revenue from s),
  'somme des espaces = chiffre du restaurant (get_order_summary)');
select is((select sum(order_count)::bigint from r), (select total_orders from s),
  'somme des commandes = commandes du restaurant');

-- Chiffre par jour au calendrier du restaurant.
select is((select day from public.get_daily_revenue('e2000000-0000-4000-8000-000000000001',
             '2026-01-10 00:00+00', '2026-01-12 00:00+00', 'Africa/Douala')),
  '2026-01-11'::date, 'chiffre par jour: 0 h 30 a Douala compte le 11 (jour du restaurant)');
select is((select day from public.get_daily_revenue('e2000000-0000-4000-8000-000000000001',
             '2026-01-10 00:00+00', '2026-01-12 00:00+00')),
  '2026-01-10'::date, 'temoin: sans fuseau (UTC, ancien calcul), la vente tombait la veille');
select throws_ok(
  $$select * from public.get_daily_revenue('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now(), 'Mars/Olympus')$$,
  '22023', null, 'chiffre par jour: fuseau inconnu refuse');

select is(
  (select item_name from public.get_venue_top_items('e2000000-0000-4000-8000-000000000001',
     now() - interval '1 day', now() + interval '1 minute', 1)
   where venue_id = 'e4000000-0000-4000-8000-000000000002'),
  'Jus', 'Bar: meilleure vente = Jus (6)');
select is(
  (select count(*)::int from public.get_venue_top_items('e2000000-0000-4000-8000-000000000001',
     now() - interval '1 day', now() + interval '1 minute', 1)),
  4, 'p_limit = 1: un plat par espace vendeur (Terrasse, Bar, Ancien, sans espace)');

-- Plans acceptes.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000005"}';
select lives_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000005', now() - interval '1 day', now())$$,
  'Enterprise: autorise');
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000004"}';
select lives_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000004', now() - interval '1 day', now())$$,
  'essai actif (plan choisi Pro): autorise comme Business');

-- Pro: refuse. Temoin: le meme membre lit les rapports Pro.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002"}';
select lives_ok(
  $$select * from public.get_order_summary('e2000000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  'temoin: le proprietaire Pro lit les rapports Pro');
select throws_like(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  '%Business plan%', 'Pro: rapport par espace refuse (par le plan)');
select throws_like(
  $$select * from public.get_venue_top_items('e2000000-0000-4000-8000-000000000002', now() - interval '1 day', now(), 5)$$,
  '%Business plan%', 'Pro: meilleures ventes par espace refusees (par le plan)');

-- Starter: refuse.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003"}';
select throws_like(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000003', now() - interval '1 day', now())$$,
  '%Business plan%', 'Starter: rapport par espace refuse (par le plan)');
select throws_like(
  $$select * from public.get_venue_top_items('e2000000-0000-4000-8000-000000000003', now() - interval '1 day', now(), 5)$$,
  '%Business plan%', 'Starter: meilleures ventes par espace refusees (par le plan)');

-- Non-membre (proprietaire Starter) sur un restaurant Pro: refuse sur
-- l'appartenance, le message ne dit rien du plan.
select throws_like(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  '%not a member%', 'non-membre: refus d appartenance, sans indice sur le plan');

-- Abonnement Business inutilisable: refuse.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000006"}';
select throws_like(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000006', now() - interval '1 day', now())$$,
  '%Business plan%', 'Business gele: refuse (par le plan)');
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000007"}';
select throws_like(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000007', now() - interval '1 day', now())$$,
  '%Business plan%', 'essai expire (plan choisi Business): refuse (par le plan)');

-- Droit reports.view en base.
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000008"}';
select throws_like(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  '%reports.money%', 'serveur: rapport par espace refuse (droit reports.view)');
select throws_like(
  $$select * from public.get_order_summary('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  '%reports.money%', 'serveur: resume des ventes refuse aussi (faille des rapports Pro fermee)');
select throws_like(
  $$select * from public.get_daily_revenue('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  '%reports.money%', 'serveur: chiffre par jour refuse');
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000009"}';
select lives_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  'caissier a qui le proprietaire a donne le droit: autorise');
select lives_ok(
  $$select * from public.get_order_summary('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  'caissier avec le droit: resume des ventes autorise');

reset role;
-- Le droit retire par le proprietaire sur un role l'emporte aussi.
insert into public.role_permissions (tenant_id, role, permissions)
values ('e2000000-0000-4000-8000-000000000001', 'manager', '{"reports.view": false}')
on conflict (tenant_id, role) do update set permissions = excluded.permissions;
update public.admin_users set role = 'manager', custom_permissions = null
 where id = 'e3000000-0000-4000-8000-000000000008';
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000008"}';
select throws_like(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  '%reports.money%', 'gerant dont le proprietaire a retire le droit: refuse');

reset role;
delete from public.role_permissions where tenant_id = 'e2000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok(
  $$select * from public.get_venue_report('e2000000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  'temoin: le meme gerant sans retrait du droit est autorise');

reset role;
select is(has_function_privilege('anon',
  'public.get_venue_report(uuid, timestamptz, timestamptz)', 'EXECUTE'),
  false, 'anon n execute pas get_venue_report');
select is(has_function_privilege('anon',
  'public.get_venue_top_items(uuid, timestamptz, timestamptz, integer)', 'EXECUTE'),
  false, 'anon n execute pas get_venue_top_items');
select is(has_function_privilege('authenticated',
  'public.assert_tenant_reports_view(uuid)', 'EXECUTE'),
  false, 'les fonctions de verrou ne sont pas appelables par les clients');
select is(has_function_privilege('anon',
  'public.get_daily_revenue(uuid, timestamptz, timestamptz, text)', 'EXECUTE'),
  false, 'anon n execute pas get_daily_revenue (nouvelle signature)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'get_daily_revenue'),
  1, 'get_daily_revenue: une seule surcharge (l ancienne a 3 arguments est supprimee)');

select * from finish();
rollback;
