-- Fermeture d'une table verrouillee (migration 20261115200000).
--
-- Regle (decision du proprietaire du 2026-11-15, usage du marche): une table
-- reste occupee tant qu'une commande non annulee est impayee, partiellement
-- payee ou pas encore servie (sauf commande plus ancienne que le delai), et le
-- bouton "Liberer la table" (p_require_served = false) ne compte que l'argent
-- du et reste reserve au service_role. Le verrou partage avec
-- create_order_with_items se prouve a deux connexions (voir le README des
-- tests); ici: la regle, les droits et le cloisonnement.
--
-- Temoin negatif: sans la migration, la fonction n'existe pas et chaque appel
-- echoue.
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/fermeture_table_verrouillee.test.sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values
  ('f1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur@ferme.local', 'x', now(), now(), now()),
  ('f2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'autre@ferme.local', 'x', now(), now(), now()),
  ('f3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cuisine@ferme.local', 'x', now(), now(), now());

insert into public.tenants (id, slug, name, is_active)
values
  ('fa000000-0000-4000-8000-000000000001', 'ferme-a', 'Ferme A', true),
  ('fb000000-0000-4000-8000-000000000002', 'ferme-b', 'Ferme B', true);

insert into public.admin_users (tenant_id, user_id, email, role, is_active)
values
  ('fa000000-0000-4000-8000-000000000001', 'f1111111-1111-4111-8111-111111111111', 'serveur@ferme.local', 'cashier', true),
  ('fa000000-0000-4000-8000-000000000001', 'f3333333-3333-4333-8333-333333333333', 'cuisine@ferme.local', 'chef', true),
  ('fb000000-0000-4000-8000-000000000002', 'f2222222-2222-4222-8222-222222222222', 'autre@ferme.local', 'owner', true);

-- Six tables ouvertes du restaurant A, une par cas.
insert into public.table_sessions (id, tenant_id, table_number)
values
  ('5e000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'T1'),
  ('5e000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001', 'T2'),
  ('5e000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000001', 'T3'),
  ('5e000000-0000-4000-8000-000000000004', 'fa000000-0000-4000-8000-000000000001', 'T4'),
  ('5e000000-0000-4000-8000-000000000005', 'fa000000-0000-4000-8000-000000000001', 'T5'),
  ('5e000000-0000-4000-8000-000000000006', 'fa000000-0000-4000-8000-000000000001', 'T6'),
  ('5e000000-0000-4000-8000-000000000007', 'fa000000-0000-4000-8000-000000000001', 'T7');

insert into public.orders (tenant_id, session_id, order_number, subtotal, total, status, payment_status, created_at)
values
  -- T1: impayee
  ('fa000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000001', 'F-1', 1000, 1000, 'delivered', 'pending', now()),
  -- T2: payee, encore en cuisine
  ('fa000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000002', 'F-2', 1000, 1000, 'preparing', 'paid', now()),
  -- T3: payee et servie
  ('fa000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000003', 'F-3', 1000, 1000, 'delivered', 'paid', now()),
  -- T4: payee, jamais marquee servie, creee il y a 3 h
  ('fa000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000004', 'F-4', 1000, 1000, 'ready', 'paid', now() - interval '3 hours'),
  -- T5: partiellement payee et servie
  ('fa000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000005', 'F-5', 1000, 1000, 'delivered', 'partial', now()),
  -- T6: payee, en cuisine (liberation manuelle)
  ('fa000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000006', 'F-6', 1000, 1000, 'pending', 'paid', now()),
  -- T7: payee, en cuisine depuis 10 min
  ('fa000000-0000-4000-8000-000000000001', '5e000000-0000-4000-8000-000000000007', 'F-7', 1000, 1000, 'preparing', 'paid', now() - interval '10 minutes');

-- ----------------------------------------------- le caissier du restaurant A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', now() - interval '2 hours'),
  'unsettled', 'impayee: la table reste occupee');
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001', now() - interval '2 hours'),
  'unsettled', 'payee mais en cuisine: la table reste occupee');
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000001', now() - interval '2 hours'),
  'closed', 'payee et servie: la table se libere');
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000004', 'fa000000-0000-4000-8000-000000000001', now() - interval '2 hours'),
  'closed', 'payee, jamais marquee servie depuis 3 h: liberee par le delai');
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000005', 'fa000000-0000-4000-8000-000000000001', now() - interval '2 hours'),
  'unsettled', 'partiellement payee: il reste de l argent du');
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000001', now() - interval '2 hours'),
  'not_open', 'deja fermee: rien a refaire');
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000007', 'fa000000-0000-4000-8000-000000000001', now()),
  'unsettled', 'un employe ne peut pas avancer le delai pour liberer une table en cuisine');
select throws_ok(
  $$ select close_table_session_if_settled('5e000000-0000-4000-8000-000000000006', 'fa000000-0000-4000-8000-000000000001', null, false) $$,
  '42501', null, 'liberation manuelle: reservee au serveur applicatif (service_role)');

-- ------------------------- un employe du restaurant SANS le droit d'encaisser
select set_config('request.jwt.claims', '{"sub":"f3333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
select throws_ok(
  $$ select close_table_session_if_settled('5e000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'sans orders.pay, un employe ne ferme pas une table lui-meme (meme droit que la policy)');

-- ------------------------------------------ un proprietaire d'un AUTRE restaurant
select set_config('request.jwt.claims', '{"sub":"f2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select close_table_session_if_settled('5e000000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'un autre restaurant ne peut rien fermer');
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000002'),
  'not_open', 'la table d A cherchee sous le restaurant B est introuvable');

-- --------------------------------------------------------- anon: aucun droit
reset role;
set local role anon;
select throws_ok(
  $$ select close_table_session_if_settled('5e000000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon ne peut pas appeler la fonction');

-- ------------------------------------------- service_role: bouton "Liberer"
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000006', 'fa000000-0000-4000-8000-000000000001', null, false),
  'closed', 'liberation manuelle: payee, meme en cuisine, la table se libere');
select is(close_table_session_if_settled('5e000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', null, false),
  'unsettled', 'liberation manuelle refusee tant que de l argent est du');

select * from finish();
rollback;
