-- Revue ligne par ligne, lot A (migrations 20261121200000, 20261121200100,
-- 20261121200200).
--
-- A1  : une commande qui porte de l'argent au registre ne se supprime pas
--       (politique DELETE de orders), une commande sans argent si.
-- A4  : une ardoise soldee ne recoit plus de commande; une ardoise ne se solde
--       pas tant qu'une commande reste a encaisser.
-- A14 : reassign_order_table ne libere pas l'ancienne table s'il y reste une
--       commande partiellement payee.
-- A15 : reassign_order_table exige orders.manage, pas seulement l'appartenance.
--
-- Temoin negatif: sans ces migrations, les assertions 1, 3, 5, 7 et 9 echouent
-- (suppression acceptee, attache acceptee, solde accepte, table liberee,
-- deplacement accepte sans le droit).
-- Execution: scripts/run-pgtap.sh --local
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio@lota.local', 'x', now(), now(), now()),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caisse@lota.local', 'x', now(), now(), now()),
  ('a3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur@lota.local', 'x', now(), now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('aa000000-0000-4000-8000-000000000001', 'lot-a', 'Lot A', true);

insert into public.admin_users (tenant_id, user_id, email, role, is_active, custom_permissions)
values
  ('aa000000-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 'proprio@lota.local', 'owner', true, null),
  ('aa000000-0000-4000-8000-000000000001', 'a2222222-2222-4222-8222-222222222222', 'caisse@lota.local', 'cashier', true, null),
  ('aa000000-0000-4000-8000-000000000001', 'a3333333-3333-4333-8333-333333333333', 'serveur@lota.local', 'waiter', true, '{"orders.manage": false}'::jsonb);

insert into public.table_sessions (id, tenant_id, table_number)
values
  ('5a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'T1'),
  ('5a000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001', 'T3');

insert into public.orders (id, tenant_id, session_id, table_number, service_type, order_number, subtotal, total, status, payment_status, created_at)
values
  -- A1: acompte au registre / sans argent
  ('0a000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', null, null, 'takeaway', 'A-1', 1000, 1000, 'pending', 'partial', now()),
  ('0a000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', null, null, 'takeaway', 'A-2', 1000, 1000, 'pending', 'pending', now()),
  -- A4: commandes a poser sur une ardoise
  ('0a000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001', null, null, 'takeaway', 'A-3', 1000, 1000, 'pending', 'pending', now()),
  -- A14: table T1 = une commande partielle servie + la commande a deplacer
  ('0a000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'T1', 'dine_in', 'A-4', 1000, 1000, 'delivered', 'partial', now()),
  ('0a000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'T1', 'dine_in', 'A-5', 1000, 1000, 'preparing', 'pending', now()),
  -- A14 temoin: table T3 = une commande payee et servie + la commande a deplacer
  ('0a000000-0000-4000-8000-000000000006', 'aa000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000003', 'T3', 'dine_in', 'A-6', 1000, 1000, 'delivered', 'paid', now()),
  ('0a000000-0000-4000-8000-000000000007', 'aa000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000003', 'T3', 'dine_in', 'A-7', 1000, 1000, 'preparing', 'pending', now());

insert into public.payments (tenant_id, order_id, amount, method, status)
values ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000001', 400, 'cash', 'completed');

insert into public.house_accounts (id, tenant_id, name, status)
values
  ('ba000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Soldee', 'settled'),
  ('ba000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', 'Ouverte', 'open');

-- ------------------------------------------------------------ A1, proprietaire
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
delete from public.orders where id in ('0a000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000002');
reset role;
select ok(exists (select 1 from public.orders where id = '0a000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.payments where order_id = '0a000000-0000-4000-8000-000000000001'),
  'A1: commande avec acompte au registre: ni la commande ni le paiement ne disparaissent');
select ok(not exists (select 1 from public.orders where id = '0a000000-0000-4000-8000-000000000002'),
  'A1 temoin: commande sans argent: supprimee');

-- ------------------------------------------------------------- A4, caissier
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ update public.orders set house_account_id = 'ba000000-0000-4000-8000-000000000001' where id = '0a000000-0000-4000-8000-000000000003' $$,
  '23514', null, 'A4: poser une commande sur une ardoise soldee est refuse');
select lives_ok(
  $$ update public.orders set house_account_id = 'ba000000-0000-4000-8000-000000000002' where id = '0a000000-0000-4000-8000-000000000003' $$,
  'A4 temoin: poser une commande sur une ardoise ouverte reste possible');
reset role;
select throws_ok(
  $$ update public.house_accounts set status = 'settled' where id = 'ba000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'A4: solder une ardoise qui porte une commande impayee est refuse');
update public.orders set payment_status = 'paid' where id = '0a000000-0000-4000-8000-000000000003';
select lives_ok(
  $$ update public.house_accounts set status = 'settled' where id = 'ba000000-0000-4000-8000-000000000002' $$,
  'A4 temoin: une ardoise dont tout est encaisse se solde');

-- ------------------------------------------------------------ A14, caissier
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select reassign_order_table('0a000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001', 'T2');
select reassign_order_table('0a000000-0000-4000-8000-000000000007', 'aa000000-0000-4000-8000-000000000001', 'T4');
reset role;
select is((select status from public.table_sessions where id = '5a000000-0000-4000-8000-000000000001'),
  'open', 'A14: une commande partiellement payee reste sur T1: la table reste occupee');
select is((select status from public.table_sessions where id = '5a000000-0000-4000-8000-000000000003'),
  'closed', 'A14 temoin: plus rien a regler ni a servir sur T3: la table se libere');

-- ------------------------------------------------- A15, serveur sans le droit
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok(
  $$ select reassign_order_table('0a000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001', 'T5') $$,
  '42501', null, 'A15: sans orders.manage, un membre ne deplace pas une commande par l API');
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select lives_ok(
  $$ select reassign_order_table('0a000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001', 'T5') $$,
  'A15 temoin: avec orders.manage, le deplacement passe');

select * from finish();
rollback;
