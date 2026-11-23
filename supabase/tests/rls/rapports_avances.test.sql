-- Rapports avances (migration 20261123130000, lot 4 PR B).
--
-- Donnees: un restaurant Business. Deux commandes reglees le mercredi
-- 2026-11-18 a 11 h 30 UTC (12 h 30 a Douala):
--   C1: 2 Poulet (5 000) = 10 000, paye 10 000 en especes puis 2 000 rembourses;
--   C2: 1 Poulet + 3 Jus (1 000) = 8 000, paye en Orange Money.
-- Fiche du Poulet: 0,5 kg de poulet a 2 500 + 0,05 L d'huile a 1 200 = 1 310.
-- Le Jus n'a pas de fiche. Le Riz a une fiche dont l'ingredient n'a pas de cout.
-- C4: payee en deux fois en Wave, 1 000 a 14 h 10 et 2 000 a 16 h 20 (Douala):
--   une seule commande, comptee a 14 h; l'argent compte a chaque heure.
-- C5: 1 Brochette (4 000) + 1 Riz (1 000), remise de 1 000 (20 %): la remise
--   est repartie au prorata, Brochette = 4 000 - 800 = 3 200.
-- P1: commande payee 777 (pourboire 77) au debut de la semaine precedente
--   (Douala): la periode precedente de la comparaison n'est pas vide.
-- Pertes: 1,5 kg de poulet (perime) + 0,5 kg (casse), 1 kg de riz (sans cout),
-- et un retrait manuel (pas une perte: temoin d'exclusion).
--
-- Verrous: Starter et Pro refuses (42501) sur les cinq fonctions, alors que le
-- meme membre Pro lit get_order_summary (temoin). Autre restaurant refuse,
-- serveur sans droit reports.view refuse, anon sans droit.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(57);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'av-biz@test.local', 'x', now(), now()),
  ('f1100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'av-pro@test.local', 'x', now(), now()),
  ('f1100000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'av-starter@test.local', 'x', now(), now()),
  ('f1100000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'av-serveur@test.local', 'x', now(), now()),
  ('f1100000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'av-essai@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status, trial_ends_at)
values
  ('f1200000-0000-4000-8000-000000000001', 'av-biz', 'Biz', true, 'business', 'active', null),
  ('f1200000-0000-4000-8000-000000000002', 'av-pro', 'Pro', true, 'pro', 'active', null),
  ('f1200000-0000-4000-8000-000000000003', 'av-starter', 'Starter', true, 'starter', 'active', null),
  -- Essai actif, plan choisi Pro: l'essai donne Business.
  ('f1200000-0000-4000-8000-000000000004', 'av-essai', 'Essai', true, 'pro', 'trial', now() + interval '5 days');

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  ('f1300000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001',
   'f1100000-0000-4000-8000-000000000001', 'av-biz@test.local', 'owner', true),
  ('f1300000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000002',
   'f1100000-0000-4000-8000-000000000002', 'av-pro@test.local', 'owner', true),
  ('f1300000-0000-4000-8000-000000000003', 'f1200000-0000-4000-8000-000000000003',
   'f1100000-0000-4000-8000-000000000003', 'av-starter@test.local', 'owner', true),
  ('f1300000-0000-4000-8000-000000000004', 'f1200000-0000-4000-8000-000000000001',
   'f1100000-0000-4000-8000-000000000004', 'av-serveur@test.local', 'waiter', true),
  ('f1300000-0000-4000-8000-000000000005', 'f1200000-0000-4000-8000-000000000004',
   'f1100000-0000-4000-8000-000000000005', 'av-essai@test.local', 'owner', true);

insert into public.categories (id, tenant_id, name)
values ('f1400000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001', 'Plats');
insert into public.menu_items (id, tenant_id, category_id, name, price) values
  ('f1500000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001',
   'f1400000-0000-4000-8000-000000000001', 'Poulet', 5000),
  ('f1500000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000001',
   'f1400000-0000-4000-8000-000000000001', 'Jus', 1000),
  ('f1500000-0000-4000-8000-000000000003', 'f1200000-0000-4000-8000-000000000001',
   'f1400000-0000-4000-8000-000000000001', 'Riz', 2000),
  ('f1500000-0000-4000-8000-000000000004', 'f1200000-0000-4000-8000-000000000001',
   'f1400000-0000-4000-8000-000000000001', 'Salade', 1500),
  ('f1500000-0000-4000-8000-000000000005', 'f1200000-0000-4000-8000-000000000001',
   'f1400000-0000-4000-8000-000000000001', 'Brochette', 4000);

insert into public.ingredients (id, tenant_id, name, unit, cost_per_unit) values
  ('f1600000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001', 'Poulet cru', 'kg', 2500),
  ('f1600000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000001', 'Huile', 'L', 1200),
  ('f1600000-0000-4000-8000-000000000003', 'f1200000-0000-4000-8000-000000000001', 'Riz cru', 'kg', 0);
insert into public.recipes (tenant_id, menu_item_id, ingredient_id, quantity_needed) values
  ('f1200000-0000-4000-8000-000000000001', 'f1500000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000001', 0.5),
  ('f1200000-0000-4000-8000-000000000001', 'f1500000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000002', 0.05),
  ('f1200000-0000-4000-8000-000000000001', 'f1500000-0000-4000-8000-000000000003', 'f1600000-0000-4000-8000-000000000003', 0.25);

insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status, paid_at, created_at)
values
  ('f1700000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001', 'AV-1', 10000, 10000,
   'served', 'partial', '2026-11-18 11:30+00', '2026-11-18 11:00+00'),
  ('f1700000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000001', 'AV-2', 8000, 8000,
   'served', 'paid', '2026-11-18 11:30+00', '2026-11-18 11:00+00'),
  -- C3: 1 Riz (fiche dont l'ingredient n'a pas de cout), sans ligne au
  -- registre: n'entre que dans les ventes par plat.
  ('f1700000-0000-4000-8000-000000000003', 'f1200000-0000-4000-8000-000000000001', 'AV-3', 2000, 2000,
   'served', 'paid', '2026-11-18 11:30+00', '2026-11-18 11:00+00'),
  ('f1700000-0000-4000-8000-000000000004', 'f1200000-0000-4000-8000-000000000001', 'AV-4', 3000, 3000,
   'served', 'paid', '2026-11-18 15:20+00', '2026-11-18 13:00+00');
insert into public.orders (id, tenant_id, order_number, subtotal, total, discount_amount, status, payment_status, paid_at, created_at)
values ('f1700000-0000-4000-8000-000000000005', 'f1200000-0000-4000-8000-000000000001', 'AV-5', 5000, 4000, 1000,
        'served', 'paid', '2026-11-18 11:30+00', '2026-11-18 11:00+00');
-- P1, au debut de la semaine precedente (Douala) + 1 seconde.
insert into public.orders (id, tenant_id, order_number, subtotal, total, tip_amount, status, payment_status, paid_at, created_at)
select 'f1700000-0000-4000-8000-000000000006', 'f1200000-0000-4000-8000-000000000001', 'AV-6', 700, 700, 77,
       'served', 'paid', d, d
  from (select (date_trunc('week', now() at time zone 'Africa/Douala') - interval '1 week' + interval '1 second')
               at time zone 'Africa/Douala' as d) x;
insert into public.order_items (tenant_id, order_id, menu_item_id, item_name, price_at_order, quantity) values
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000001', 'f1500000-0000-4000-8000-000000000001', 'Poulet', 5000, 2),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000002', 'f1500000-0000-4000-8000-000000000001', 'Poulet', 5000, 1),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000002', 'f1500000-0000-4000-8000-000000000002', 'Jus', 1000, 3),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000003', 'f1500000-0000-4000-8000-000000000003', 'Riz', 2000, 1),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000005', 'f1500000-0000-4000-8000-000000000005', 'Brochette', 4000, 1),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000005', 'f1500000-0000-4000-8000-000000000003', 'Riz', 1000, 1);
insert into public.payments (tenant_id, order_id, amount, method, status, created_at) values
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000001', 10000, 'cash', 'completed', '2026-11-18 11:30+00'),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000001', 2000, 'cash', 'refunded', '2026-11-18 11:40+00'),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000002', 8000, 'orange_money', 'completed', '2026-11-18 11:30+00'),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000004', 1000, 'wave', 'completed', '2026-11-18 13:10+00'),
  ('f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000004', 2000, 'wave', 'completed', '2026-11-18 15:20+00');
insert into public.payments (tenant_id, order_id, amount, method, status, created_at)
select 'f1200000-0000-4000-8000-000000000001', 'f1700000-0000-4000-8000-000000000006', 777, 'cash', 'completed', paid_at
  from public.orders where id = 'f1700000-0000-4000-8000-000000000006';

insert into public.stock_movements (tenant_id, ingredient_id, movement_type, quantity, reason_code, created_at) values
  ('f1200000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000001', 'loss', -1.5, 'expired', '2026-11-18 09:00+00'),
  ('f1200000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000001', 'loss', -0.5, 'breakage', '2026-11-18 09:30+00'),
  ('f1200000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000003', 'loss', -1, 'expired', '2026-11-18 09:45+00'),
  ('f1200000-0000-4000-8000-000000000001', 'f1600000-0000-4000-8000-000000000001', 'manual_remove', -4, null, '2026-11-18 10:00+00');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1100000-0000-4000-8000-000000000001"}';

-- 1. Marge par plat.
create temp table m as select * from public.get_dish_margins('f1200000-0000-4000-8000-000000000001',
  '2026-11-18 00:00+00', '2026-11-19 00:00+00');
select is((select quantity_sold from m where item_name = 'Poulet'), 3::bigint, 'marge: 3 poulets vendus');
select is((select revenue from m where item_name = 'Poulet'), 15000::bigint, 'marge: ventes du poulet');
select is((select unit_cost from m where item_name = 'Poulet'), 1310.000::numeric, 'marge: cout de fiche 0,5 x 2500 + 0,05 x 1200');
select is((select has_recipe from m where item_name = 'Jus'), false, 'plat sans fiche: signale, pas de marge inventee');
select is((select unit_cost from m where item_name = 'Jus'), null::numeric, 'plat sans fiche: cout absent');
select is((select cost_complete from m where item_name = 'Riz'), false,
  'fiche dont un ingredient n a pas de cout: signalee incomplete');
select is((select count(*)::int from m where item_name = 'Salade'), 0, 'plat jamais vendu: absent');
select is((select cost_complete from m where item_name = 'Poulet'), true, 'fiche complete: signalee complete');
select is((select revenue from m where item_name = 'Brochette'), 3200::bigint,
  'remise de 20 % repartie au prorata: 4 000 - 800');
select is((select revenue from m where item_name = 'Riz'), 2800::bigint,
  'Riz: 2 000 (C3) + 1 000 - 200 de remise (C5)');

-- 2. Heures fortes, a l'heure de Douala (UTC+1).
create temp table h as select * from public.get_sales_heatmap('f1200000-0000-4000-8000-000000000001',
  '2026-11-18 00:00+00', '2026-11-19 00:00+00', 'Africa/Douala');
select is((select revenue from h where day_of_week = 3 and hour_of_day = 12), 16000::bigint,
  'heures fortes: mercredi 12 h a Douala, rembourse deduit');
select is((select order_count from h where day_of_week = 3 and hour_of_day = 12), 2::bigint, 'heures fortes: deux commandes');
select is((select count(*)::int from h where hour_of_day = 11), 0, 'heures fortes: rien a 11 h UTC (temoin du fuseau)');
select is((select order_count from h where day_of_week = 3 and hour_of_day = 14), 1::bigint,
  'commande payee en deux fois: comptee une fois, a l heure du premier paiement');
select is((select order_count from h where day_of_week = 3 and hour_of_day = 16), 0::bigint,
  'commande payee en deux fois: pas comptee une seconde fois');
select is((select revenue from h where day_of_week = 3 and hour_of_day = 16), 2000::bigint,
  'l argent du second paiement compte a son heure');
select is((select sum(order_count)::bigint from h),
  (select total_orders from public.get_order_summary('f1200000-0000-4000-8000-000000000001',
     '2026-11-18 00:00+00', '2026-11-19 00:00+00')),
  'somme des cases = commandes du resume');
select throws_ok(
  $$select * from public.get_sales_heatmap('f1200000-0000-4000-8000-000000000001', now() - interval '1 day', now(), 'Mars/Olympus')$$,
  '22023', null, 'fuseau inconnu: refuse');
select throws_ok(
  $$select * from public.get_sales_heatmap('f1200000-0000-4000-8000-000000000001', now() - interval '1 day', now(), null)$$,
  '22023', null, 'fuseau absent: refuse');

-- 3. Comparaison: chaque ligne egale le resume sur ses propres bornes.
create temp table c as select * from public.get_period_comparison('f1200000-0000-4000-8000-000000000001', 'week', 'Africa/Douala');
create temp table cs as
  select c.period, s.total_revenue, s.total_orders, s.total_tips
    from c cross join lateral public.get_order_summary('f1200000-0000-4000-8000-000000000001', c.start_at, c.end_at) s;
select is((select count(*)::int from c), 2, 'comparaison: periode en cours et precedente');
select ok((select end_at from c where period = 'previous') < (select start_at from c where period = 'current'),
  'comparaison: la periode precedente finit avant le debut de la periode en cours');
select is((select revenue::numeric from c where period = 'current'), (select total_revenue from cs where period = 'current'),
  'comparaison, en cours: chiffre = resume');
select is((select order_count::bigint from c where period = 'current'), (select total_orders from cs where period = 'current'),
  'comparaison, en cours: commandes = resume');
select is((select tips::numeric from c where period = 'current'), (select total_tips from cs where period = 'current'),
  'comparaison, en cours: pourboires = resume');
select is((select revenue from c where period = 'previous'), 777::bigint,
  'comparaison, precedente: la commande du debut de semaine precedente est comptee');
select is((select order_count from c where period = 'previous'), 1::bigint, 'comparaison, precedente: une commande');
select is((select tips from c where period = 'previous'), 77::bigint, 'comparaison, precedente: son pourboire');
select is((select revenue::numeric from c where period = 'previous'), (select total_revenue from cs where period = 'previous'),
  'comparaison, precedente: chiffre = resume');
select throws_ok(
  $$select * from public.get_period_comparison('f1200000-0000-4000-8000-000000000001', 'year', 'Africa/Douala')$$,
  '22023', null, 'comparaison: mode inconnu refuse');

-- 4. Moyens de paiement.
create temp table p as select * from public.get_payment_method_report('f1200000-0000-4000-8000-000000000001',
  '2026-11-18 00:00+00', '2026-11-19 00:00+00');
select is((select net from p where method = 'cash'), 8000::bigint, 'especes: 10 000 encaisses moins 2 000 rembourses');
select is((select refunded from p where method = 'cash'), 2000::bigint, 'especes: rembourse');
select is((select collected from p where method = 'orange_money'), 8000::bigint, 'Orange Money: encaisse');
select is((select sum(net)::numeric from p),
  (select total_revenue from public.get_order_summary('f1200000-0000-4000-8000-000000000001',
     '2026-11-18 00:00+00', '2026-11-19 00:00+00')),
  'somme des moyens = chiffre du restaurant');

-- 5. Pertes.
create temp table l as select * from public.get_stock_losses_report('f1200000-0000-4000-8000-000000000001',
  '2026-11-18 00:00+00', '2026-11-19 00:00+00');
select is((select quantity from l where ingredient_name = 'Poulet cru'), 2.000::numeric, 'pertes: 2 kg, retrait manuel exclu');
select is((select cost_complete from l where ingredient_name = 'Poulet cru'), true, 'pertes: ingredient avec cout, valeur complete');
select is((select cost_complete from l where ingredient_name = 'Riz cru'), false, 'pertes: ingredient sans cout, signale');
select is((select cost_value from l where ingredient_name = 'Poulet cru'), 5000.000::numeric, 'pertes: valeur 2 x 2 500');
select is((select main_reason from l where ingredient_name = 'Poulet cru'), 'expired', 'pertes: motif principal');

-- Verrous. Temoin: le membre Pro lit les rapports Pro.
set local request.jwt.claims = '{"sub":"f1100000-0000-4000-8000-000000000002"}';
select lives_ok(
  $$select * from public.get_order_summary('f1200000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  'temoin: le membre Pro lit les rapports Pro');
select throws_like($$select * from public.get_dish_margins('f1200000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  '%Business plan%', 'Pro: marge par plat refusee (par le plan)');
select throws_like($$select * from public.get_sales_heatmap('f1200000-0000-4000-8000-000000000002', now() - interval '1 day', now(), 'Africa/Douala')$$,
  '%Business plan%', 'Pro: heures fortes refusees (par le plan)');
select throws_like($$select * from public.get_period_comparison('f1200000-0000-4000-8000-000000000002', 'week', 'Africa/Douala')$$,
  '%Business plan%', 'Pro: comparaison refusee (par le plan)');
select throws_like($$select * from public.get_payment_method_report('f1200000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  '%Business plan%', 'Pro: moyens de paiement refuses (par le plan)');
select throws_like($$select * from public.get_stock_losses_report('f1200000-0000-4000-8000-000000000002', now() - interval '1 day', now())$$,
  '%Business plan%', 'Pro: pertes refusees (par le plan)');

set local request.jwt.claims = '{"sub":"f1100000-0000-4000-8000-000000000003"}';
select throws_like($$select * from public.get_dish_margins('f1200000-0000-4000-8000-000000000003', now() - interval '1 day', now())$$,
  '%Business plan%', 'Starter: marge par plat refusee (par le plan)');
select throws_like($$select * from public.get_sales_heatmap('f1200000-0000-4000-8000-000000000003', now() - interval '1 day', now(), 'Africa/Douala')$$,
  '%Business plan%', 'Starter: heures fortes refusees (par le plan)');
select throws_like($$select * from public.get_period_comparison('f1200000-0000-4000-8000-000000000003', 'week', 'Africa/Douala')$$,
  '%Business plan%', 'Starter: comparaison refusee (par le plan)');
select throws_like($$select * from public.get_payment_method_report('f1200000-0000-4000-8000-000000000003', now() - interval '1 day', now())$$,
  '%Business plan%', 'Starter: moyens de paiement refuses (par le plan)');
select throws_like($$select * from public.get_stock_losses_report('f1200000-0000-4000-8000-000000000003', now() - interval '1 day', now())$$,
  '%Business plan%', 'Starter: pertes refusees (par le plan)');
-- Le membre Starter sur le restaurant Business: refuse (appartenance).
select throws_ok($$select * from public.get_dish_margins('f1200000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  '42501', null, 'autre restaurant: refuse');

-- Essai actif (plan choisi Pro): les cinq fonctions sont ouvertes.
set local request.jwt.claims = '{"sub":"f1100000-0000-4000-8000-000000000005"}';
select lives_ok($$select * from public.get_dish_margins('f1200000-0000-4000-8000-000000000004', now() - interval '1 day', now())$$,
  'essai actif: marge par plat ouverte');
select lives_ok($$select * from public.get_sales_heatmap('f1200000-0000-4000-8000-000000000004', now() - interval '1 day', now(), 'Africa/Douala')$$,
  'essai actif: heures fortes ouvertes');
select lives_ok($$select * from public.get_period_comparison('f1200000-0000-4000-8000-000000000004', 'week', 'Africa/Douala')$$,
  'essai actif: comparaison ouverte');
select lives_ok($$select * from public.get_payment_method_report('f1200000-0000-4000-8000-000000000004', now() - interval '1 day', now())$$,
  'essai actif: moyens de paiement ouverts');
select lives_ok($$select * from public.get_stock_losses_report('f1200000-0000-4000-8000-000000000004', now() - interval '1 day', now())$$,
  'essai actif: pertes ouvertes');

-- Serveur du restaurant Business: pas de droit reports.view, refuse.
set local request.jwt.claims = '{"sub":"f1100000-0000-4000-8000-000000000004"}';
select throws_like($$select * from public.get_payment_method_report('f1200000-0000-4000-8000-000000000001', now() - interval '1 day', now())$$,
  '%reports.view%', 'serveur: moyens de paiement refuses (droit reports.view)');

reset role;
select is(
  (select bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('get_dish_margins', 'get_sales_heatmap', 'get_period_comparison',
                        'get_payment_method_report', 'get_stock_losses_report')),
  false, 'anon n execute aucune des cinq fonctions');

select * from finish();
rollback;
