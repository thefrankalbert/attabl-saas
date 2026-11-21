-- Lot pourboires (migration 20261120210000, audit du 2026-11-20).
--
-- C. get_order_summary.total_tips suit la date d'ENCAISSEMENT (paid_at), comme
--    les revenus. L'ancienne version (date de creation) rend un autre total
--    ici: temoin.
-- D. get_server_performance renvoie une colonne `tips` par serveur, y compris
--    pour un serveur sans ligne au registre dans la periode.
--
-- Le controle du plan sur le pourboire (constat G) est teste avec son
-- declencheur, dans la PR #444.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('d3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'caissier-pro@test.local', 'x', now(), now()),
  ('d5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur-pro@test.local', 'x', now(), now()),
  ('d6666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur2-pro@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status, trial_ends_at)
values
  ('da000000-0000-4000-8000-00000000000b', 'pb-pro', 'Pro', true, 'pro', 'active', null);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values
  ('db000000-0000-4000-8000-000000000003', 'da000000-0000-4000-8000-00000000000b',
   'd3333333-3333-3333-3333-333333333333', 'caissier-pro@test.local', 'cashier', true, null),
  ('db000000-0000-4000-8000-000000000005', 'da000000-0000-4000-8000-00000000000b',
   'd5555555-5555-5555-5555-555555555555', 'serveur-pro@test.local', 'waiter', true, null),
  ('db000000-0000-4000-8000-000000000006', 'da000000-0000-4000-8000-00000000000b',
   'd6666666-6666-6666-6666-666666666666', 'serveur2-pro@test.local', 'waiter', true, null);

insert into public.orders (id, tenant_id, order_number, subtotal, total, status, payment_status,
                           tip_amount, paid_at, created_at, server_id)
values
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
set local request.jwt.claims = '{"sub":"d3333333-3333-3333-3333-333333333333"}';

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
