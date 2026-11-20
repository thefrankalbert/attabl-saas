-- Lot pourboires (migration 20261120120000, audit du 2026-11-20).
--
-- G. Le declencheur de garde des commandes refuse une HAUSSE du pourboire
--    quand le plan ne comprend pas les pourboires (Starter), pour tous les
--    roles authentifies. Chaque ecriture acceptee est relue: un UPDATE masque
--    par la RLS ne leverait rien et passerait pour un succes.
-- C. get_order_summary.total_tips suit la date d'ENCAISSEMENT (paid_at), comme
--    les revenus. L'ancienne version (date de creation) rend 0 ici: temoin.
-- D. get_server_performance renvoie une colonne `tips` par serveur, y compris
--    pour un serveur sans ligne au registre dans la periode.
-- G bis. La meme regle a la CREATION d'une commande (INSERT direct par l'API).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('d1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-starter@test.local', 'x', now(), now()),
  ('d2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'proprio-starter@test.local', 'x', now(), now()),
  ('d3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-pro@test.local', 'x', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-essai@test.local', 'x', now(), now()),
  ('d5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-pro@test.local', 'x', now(), now()),
  ('d6666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur2-pro@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status, trial_ends_at)
values
  ('da000000-0000-4000-8000-00000000000a', 'pb-starter', 'Starter', true, 'starter', 'active', null),
  ('da000000-0000-4000-8000-00000000000b', 'pb-pro', 'Pro', true, 'pro', 'active', null),
  ('da000000-0000-4000-8000-00000000000c', 'pb-essai', 'Essai', true, 'starter', 'trial',
   now() + interval '7 days');

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  ('db000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000a',
   'd1111111-1111-1111-1111-111111111111', 'caissier-starter@test.local', 'cashier', true, null),
  ('db000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-00000000000a',
   'd2222222-2222-2222-2222-222222222222', 'proprio-starter@test.local', 'owner', true, null),
  ('db000000-0000-4000-8000-000000000003', 'da000000-0000-4000-8000-00000000000b',
   'd3333333-3333-3333-3333-333333333333', 'caissier-pro@test.local', 'cashier', true, null),
  ('db000000-0000-4000-8000-000000000004', 'da000000-0000-4000-8000-00000000000c',
   'd4444444-4444-4444-4444-444444444444', 'caissier-essai@test.local', 'cashier', true, null),
  ('db000000-0000-4000-8000-000000000005', 'da000000-0000-4000-8000-00000000000b',
   'd5555555-5555-5555-5555-555555555555', 'serveur-pro@test.local', 'waiter', true, null),
  ('db000000-0000-4000-8000-000000000006', 'da000000-0000-4000-8000-00000000000b',
   'd6666666-6666-6666-6666-666666666666', 'serveur2-pro@test.local', 'waiter', true, null);

insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status,
                           tip_amount, paid_at, created_at, server_id)
values
  -- Commandes en attente, pour la garde (G).
  ('dc000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-00000000000a',
   'PB-S1', 5000, 5000, 'served', 'pending', 0, null, now(), null),
  ('dc000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-00000000000a',
   'PB-S2', 5000, 5000, 'served', 'pending', 800, null, now(), null),
  ('dc000000-0000-4000-8000-000000000003', 'da000000-0000-4000-8000-00000000000b',
   'PB-P1', 5000, 5000, 'served', 'pending', 0, null, now(), null),
  ('dc000000-0000-4000-8000-000000000004', 'da000000-0000-4000-8000-00000000000c',
   'PB-E1', 5000, 5000, 'served', 'pending', 0, null, now(), null),
  -- Rapports (C, D), restaurant Pro. Creee il y a 3 jours, encaissee
  -- aujourd'hui: son pourboire compte AUJOURD'HUI.
  ('dc000000-0000-4000-8000-000000000010', 'da000000-0000-4000-8000-00000000000b',
   'PB-R1', 5000, 5000, 'served', 'paid', 500, now(), now() - interval '3 days',
   'db000000-0000-4000-8000-000000000005'),
  -- Creee aujourd'hui, pas encore reglee: son pourboire n'est pas encaisse.
  ('dc000000-0000-4000-8000-000000000011', 'da000000-0000-4000-8000-00000000000b',
   'PB-R2', 5000, 5000, 'served', 'pending', 300, null, now(),
   'db000000-0000-4000-8000-000000000005'),
  -- Annulee: exclue.
  ('dc000000-0000-4000-8000-000000000012', 'da000000-0000-4000-8000-00000000000b',
   'PB-R3', 5000, 5000, 'cancelled', 'paid', 999, now(), now(),
   'db000000-0000-4000-8000-000000000005'),
  -- Reglee dans la periode, ligne au registre HORS periode (hier soir, bornes):
  -- le serveur 2 n'a que son pourboire dans la periode.
  ('dc000000-0000-4000-8000-000000000014', 'da000000-0000-4000-8000-00000000000b',
   'PB-R5', 5000, 5000, 'served', 'paid', 300, now(), now(),
   'db000000-0000-4000-8000-000000000006'),
  -- Offerte: jamais au registre, exclue.
  ('dc000000-0000-4000-8000-000000000013', 'da000000-0000-4000-8000-00000000000b',
   'PB-R4', 5000, 5000, 'served', 'comp', 700, now(), now(),
   'db000000-0000-4000-8000-000000000005');

insert into public.payments (tenant_id, order_id, amount, method, status)
values ('da000000-0000-4000-8000-00000000000b', 'dc000000-0000-4000-8000-000000000010',
        5500, 'cash', 'completed');
insert into public.payments (tenant_id, order_id, amount, method, status, created_at)
values ('da000000-0000-4000-8000-00000000000b', 'dc000000-0000-4000-8000-000000000014',
        5300, 'cash', 'completed', now() - interval '2 days');

set local role authenticated;

-- G1. Starter, caissier: hausse du pourboire refusee.
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111"}';
select throws_ok(
  $$update public.orders set tip_amount = 500 where id = 'dc000000-0000-4000-8000-000000000001'$$,
  '42501', 'Les pourboires ne sont pas inclus dans votre plan',
  'starter, caissier: ne pose pas de pourboire');

-- G2. Starter: une BAISSE reste permise (annulation d un encaissement rate).
select lives_ok(
  $$update public.orders set tip_amount = 0 where id = 'dc000000-0000-4000-8000-000000000002'$$,
  'starter: le pourboire peut redescendre');
select is((select tip_amount from public.orders where id = 'dc000000-0000-4000-8000-000000000002'),
  0::bigint, 'starter: la baisse a bien ete ecrite');

-- G3. Starter, proprietaire (autorite argent): refuse aussi, c est le plan qui juge.
set local request.jwt.claims = '{"sub":"d2222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$update public.orders set tip_amount = 500 where id = 'dc000000-0000-4000-8000-000000000001'$$,
  '42501', 'Les pourboires ne sont pas inclus dans votre plan',
  'starter, proprietaire: ne pose pas de pourboire non plus');

-- G4. Pro, caissier: accepte, et relu.
set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333"}';
select lives_ok(
  $$update public.orders set tip_amount = 500 where id = 'dc000000-0000-4000-8000-000000000003'$$,
  'pro, caissier: pose un pourboire');
select is((select tip_amount from public.orders where id = 'dc000000-0000-4000-8000-000000000003'),
  500::bigint, 'pro: le pourboire a bien ete ecrit');

-- G5. Aide: ne revele pas le plan d un restaurant dont on n est pas membre.
select is(public.tenant_peut_recevoir_pourboires('da000000-0000-4000-8000-00000000000b'),
  true, 'aide: membre du restaurant Pro -> oui');
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111"}';
select is(public.tenant_peut_recevoir_pourboires('da000000-0000-4000-8000-00000000000b'),
  false, 'aide: non membre -> non, meme pour un restaurant Pro');

-- G6. Essai en cours (plan starter, statut trial): acces Pro, accepte.
set local request.jwt.claims = '{"sub":"d4444444-4444-4444-4444-444444444444"}';
select lives_ok(
  $$update public.orders set tip_amount = 500 where id = 'dc000000-0000-4000-8000-000000000004'$$,
  'essai en cours: pose un pourboire');
select is((select tip_amount from public.orders where id = 'dc000000-0000-4000-8000-000000000004'),
  500::bigint, 'essai: le pourboire a bien ete ecrit');

-- G bis. Creation directe par l'API: le plan juge aussi.
set local request.jwt.claims = '{"sub":"d1111111-1111-1111-1111-111111111111"}';
select throws_ok(
  $$insert into public.orders (tenant_id, order_number, subtotal, total, status, payment_status, tip_amount)
    values ('da000000-0000-4000-8000-00000000000a', 'PB-INS-S', 5000, 5000, 'pending', 'pending', 500)$$,
  '42501', 'Les pourboires ne sont pas inclus dans votre plan',
  'starter: une commande ne nait pas avec un pourboire');
set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333"}';
select lives_ok(
  $$insert into public.orders (tenant_id, order_number, subtotal, total, status, payment_status, tip_amount)
    values ('da000000-0000-4000-8000-00000000000b', 'PB-INS-P', 5000, 5000, 'pending', 'pending', 500)$$,
  'pro: une commande peut naitre avec un pourboire');
select is((select count(*)::int from public.orders where order_number = 'PB-INS-P'), 1,
  'pro: la commande creee est bien la');

-- C. Resume: pourboires encaisses aujourd hui = 800 (R1 500 + R5 300).
set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333"}';
select is(
  (select total_tips from public.get_order_summary('da000000-0000-4000-8000-00000000000b',
     now() - interval '1 day', now() + interval '1 minute')),
  800::numeric, 'resume: pourboires sur la date d encaissement');
select is(
  (select total_revenue from public.get_order_summary('da000000-0000-4000-8000-00000000000b',
     now() - interval '1 day', now() + interval '1 minute')),
  5500::numeric, 'resume: revenu inchange (registre, pourboire compris)');

-- D. Performance par serveur: colonne tips.
select is(
  (select tips from public.get_server_performance('da000000-0000-4000-8000-00000000000b',
     now() - interval '1 day', now() + interval '1 minute')
   where server_id = 'db000000-0000-4000-8000-000000000005'),
  500::numeric, 'serveur: pourboires encaisses du serveur');
select is(
  (select revenue from public.get_server_performance('da000000-0000-4000-8000-00000000000b',
     now() - interval '1 day', now() + interval '1 minute')
   where server_id = 'db000000-0000-4000-8000-000000000005'),
  5500::numeric, 'serveur: revenu inchange');
select is(
  (select tips from public.get_server_performance('da000000-0000-4000-8000-00000000000b',
     now() - interval '1 day', now() + interval '1 minute')
   where server_id = 'db000000-0000-4000-8000-000000000006'),
  300::numeric, 'serveur sans ligne au registre dans la periode: pourboire conserve');

select * from finish();
rollback;
