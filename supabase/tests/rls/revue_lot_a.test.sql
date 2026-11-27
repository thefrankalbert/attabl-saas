-- Revue ligne par ligne, lot A (migrations 20261121200000, 20261121200100,
-- 20261121200200, 20261121200300), avec les points du contre-audit.
--
-- A1  : une commande qui porte de l'argent au registre ne se supprime pas
--       (politique DELETE de orders), une commande sans argent si.
-- A4  : une ardoise soldee ne recoit plus de commande; une ardoise ne se solde
--       pas tant qu'une commande reste a encaisser.
-- A14 : reassign_order_table ne libere pas l'ancienne table s'il y reste une
--       commande partiellement payee.
-- A15 : reassign_order_table exige orders.manage, pas seulement l'appartenance;
--       le super administrateur reste admis (comme dans l'action).
-- A4 (contre-audit) : une commande a 0 ne bloque pas le solde; une commande
--       'refunded' ou 'partial' avec un reste du le bloque (meme calcul que
--       get_house_account_balances).
-- A17 : une table occupee (session ouverte) ne se supprime pas, ni directement
--       ni par la suppression de sa zone; le service_role reste libre
--       (remise a zero, suppression d'un restaurant).
--
-- A4 (second contre-audit) : un `payment_status` NULL vaut 'pending' dans les
--       soldes affiches comme dans la garde. A1 : la politique DELETE de
--       `orders` est la seule, et c'est celle de 20261121200000.
--
-- L132 (20261121200400) : un caissier solde une commande 'partial' au moyen
--       NULL quand le registre couvre le du (et repare une commande coincee);
--       refus maintenus: registre incomplet, statut autre que 'partial',
--       reetiquetage, moyen pose sans solder, autres gardes du declencheur.
--
-- Temoin negatif: sans les cinq migrations du lot (20261121200000 a 200400),
-- les assertions 1, 3, 5, 7, 9, 13, 14, 16, 17, 19, 20, 21, 30, 31 et 33
-- echouent (suppression acceptee, attache acceptee, solde accepte, table
-- liberee, deplacement accepte sans le droit, caissier bloque au solde, table
-- occupee supprimee). Les assertions 22 et 23 ne tombent que sur une clause
-- 200400 trop large (registre ignore, condition 'partial' retiree).
-- Execution: scripts/run-pgtap.sh --local
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(37);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values
  ('a4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plateforme@lota.local', 'x', now(), now(), now()),
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio@lota.local', 'x', now(), now(), now()),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'caisse@lota.local', 'x', now(), now(), now()),
  ('a3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'serveur@lota.local', 'x', now(), now(), now());

insert into public.tenants (id, slug, name, is_active)
values
  ('aa000000-0000-4000-8000-000000000001', 'lot-a', 'Lot A', true),
  ('ab000000-0000-4000-8000-000000000002', 'lot-a-plateforme', 'Plateforme', true);

insert into public.admin_users (tenant_id, user_id, email, role, is_active, custom_permissions)
values
  ('aa000000-0000-4000-8000-000000000001', 'a1111111-1111-4111-8111-111111111111', 'proprio@lota.local', 'owner', true, null),
  ('aa000000-0000-4000-8000-000000000001', 'a2222222-2222-4222-8222-222222222222', 'caisse@lota.local', 'cashier', true, null),
  ('aa000000-0000-4000-8000-000000000001', 'a3333333-3333-4333-8333-333333333333', 'serveur@lota.local', 'waiter', true, '{"orders.manage": false}'::jsonb);

-- Super administrateur, membre d'un AUTRE restaurant seulement (A15). Le
-- declencheur prevent_super_admin_elevation n'accepte un super admin que d'un
-- appel service_role (claim legacy), comme dans battement_et_reglages_plateforme.
set local request.jwt.claim.role = 'service_role';
insert into public.admin_users (tenant_id, user_id, email, role, is_active, is_super_admin)
values ('ab000000-0000-4000-8000-000000000002', 'a4444444-4444-4444-8444-444444444444', 'plateforme@lota.local', 'owner', true, true);
set local request.jwt.claim.role = '';

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
-- Tables de destination: depuis 20261124150500 (B133), une commande ne part
-- que vers une table qui existe dans le restaurant.
insert into public.venues (id, tenant_id, slug, name)
values ('cb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'salle-a14', 'Salle A14');
insert into public.zones (id, venue_id, tenant_id, name, prefix)
values ('db000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Salle', 'T');
insert into public.tables (zone_id, tenant_id, table_number, display_name)
select 'db000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', n, n
from unnest(array['T2', 'T4', 'T5', 'T6']) as n;
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
select set_config('request.jwt.claims', '{"sub":"a4444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}', true);
select lives_ok(
  $$ select reassign_order_table('0a000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001', 'T6') $$,
  'A15: le super administrateur non membre deplace une commande, comme le permet l action');
reset role;

-- ------------------------------------------------ A4 (contre-audit): soldes
insert into public.house_accounts (id, tenant_id, name, status)
values
  ('ba000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001', 'Zero', 'open'),
  ('ba000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000001', 'Rembourse', 'open'),
  ('ba000000-0000-4000-8000-000000000005', 'aa000000-0000-4000-8000-000000000001', 'Partiel', 'open');
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, status, payment_status, house_account_id, created_at)
values
  ('0a000000-0000-4000-8000-000000000010', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-10', 0, 0, 'delivered', 'pending', 'ba000000-0000-4000-8000-000000000003', now()),
  ('0a000000-0000-4000-8000-000000000011', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-11', 1000, 1000, 'delivered', 'pending', 'ba000000-0000-4000-8000-000000000004', now()),
  ('0a000000-0000-4000-8000-000000000012', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-12', 1000, 1000, 'delivered', 'pending', 'ba000000-0000-4000-8000-000000000005', now());
insert into public.payments (tenant_id, order_id, amount, method, status)
values
  ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000011', 1000, 'cash', 'completed'),
  ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000012', 400, 'cash', 'completed');
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000011', 1000, 'cash', 'refunded');
update public.orders set payment_status = 'refunded' where id = '0a000000-0000-4000-8000-000000000011';
update public.orders set payment_status = 'partial' where id = '0a000000-0000-4000-8000-000000000012';

select lives_ok(
  $$ update public.house_accounts set status = 'settled' where id = 'ba000000-0000-4000-8000-000000000003' $$,
  'A4: une commande a 0 (rien a encaisser) ne bloque pas le solde de l ardoise');
select throws_ok(
  $$ update public.house_accounts set status = 'settled' where id = 'ba000000-0000-4000-8000-000000000004' $$,
  '23514', null, 'A4: une commande remboursee en totalite, reste du positif, bloque le solde');
select throws_ok(
  $$ update public.house_accounts set status = 'settled' where id = 'ba000000-0000-4000-8000-000000000005' $$,
  '23514', null, 'A4: une commande partiellement payee bloque le solde');
select is(
  (select outstanding from public.get_house_account_balances('aa000000-0000-4000-8000-000000000001')
    where account_id = 'ba000000-0000-4000-8000-000000000004'),
  1000::bigint, 'A4: les soldes affiches comptent la meme dette (regle unique)');

-- payment_status NULL (colonne nullable): meme regle partout, NULL = 'pending'.
insert into public.house_accounts (id, tenant_id, name, status)
values ('ba000000-0000-4000-8000-000000000006', 'aa000000-0000-4000-8000-000000000001', 'Statut nul', 'open');
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, status, payment_status, house_account_id, created_at)
values ('0a000000-0000-4000-8000-000000000013', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-13', 1000, 1000, 'delivered', null, 'ba000000-0000-4000-8000-000000000006', now());
select throws_ok(
  $$ update public.house_accounts set status = 'settled' where id = 'ba000000-0000-4000-8000-000000000006' $$,
  '23514', null, 'A4: une commande au statut de paiement NULL et 1000 dus bloque le solde');
select is(
  (select outstanding from public.get_house_account_balances('aa000000-0000-4000-8000-000000000001')
    where account_id = 'ba000000-0000-4000-8000-000000000006'),
  1000::bigint, 'A4: les soldes affiches comptent aussi la commande au statut NULL');

-- A1: une seule politique DELETE (ou ALL) sur orders, celle de 20261121200000.
select is(
  (select string_agg(policyname || ':' || permissive, ',' order by policyname)
     from pg_policies
    where schemaname = 'public' and tablename = 'orders' and cmd in ('DELETE', 'ALL')),
  'Money managers can delete own tenant orders:PERMISSIVE',
  'A1: la politique DELETE de orders est unique et remplacee par 20261121200000');
select ok(
  (select qual from pg_policies
    where schemaname = 'public' and tablename = 'orders'
      and policyname = 'Money managers can delete own tenant orders') like '%payments%',
  'A1: la politique DELETE exige qu aucun paiement ne soit rattache');

-- --------------------------- L132: un caissier solde une commande 'partial'
-- (migration 20261121200400). La seule exception de la garde du moyen de
-- paiement: moyen NULL, la commande passe de 'partial' a 'paid', et le
-- registre couvre le du (meme regle que recompute).
insert into public.orders (id, tenant_id, service_type, order_number, subtotal, total, status, payment_status, payment_method, created_at)
values
  ('0a000000-0000-4000-8000-000000000020', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-20', 1000, 1000, 'delivered', 'partial', null, now()),
  ('0a000000-0000-4000-8000-000000000021', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-21', 1000, 1000, 'delivered', 'paid', 'cash', now()),
  ('0a000000-0000-4000-8000-000000000022', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-22', 1000, 1000, 'delivered', 'partial', null, now()),
  ('0a000000-0000-4000-8000-000000000023', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-23', 1000, 1000, 'delivered', 'partial', 'cash', now()),
  -- registre a 400 sur 1000: ne peut pas etre declaree payee
  ('0a000000-0000-4000-8000-000000000024', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-24', 1000, 1000, 'delivered', 'partial', null, now()),
  -- statut de paiement NULL, registre complet: hors de l'exception ('partial' exige)
  ('0a000000-0000-4000-8000-000000000025', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-25', 1000, 1000, 'delivered', null, null, now()),
  -- commande coincee: registre complet, statut reste 'partial'
  ('0a000000-0000-4000-8000-000000000026', 'aa000000-0000-4000-8000-000000000001', 'takeaway', 'A-26', 1000, 1000, 'delivered', 'partial', null, now());
insert into public.payments (tenant_id, order_id, amount, method, status)
values
  ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000020', 400, 'cash', 'completed'),
  ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000024', 400, 'cash', 'completed'),
  ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000025', 1000, 'cash', 'completed'),
  ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000026', 1000, 'cash', 'completed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
-- Le caissier encaisse le solde (600), puis l'ecriture de recompute.
insert into public.payments (tenant_id, order_id, amount, method, status)
values ('aa000000-0000-4000-8000-000000000001', '0a000000-0000-4000-8000-000000000020', 600, 'cash', 'completed');
select lives_ok(
  $$ update public.orders set payment_status = 'paid', paid_at = now(), payment_method = 'cash'
       where id = '0a000000-0000-4000-8000-000000000020' $$,
  'L132: un caissier solde une commande partial au moyen NULL (forme exacte de recompute)');
select lives_ok(
  $$ update public.orders set payment_status = 'paid', paid_at = now(), payment_method = 'cash'
       where id = '0a000000-0000-4000-8000-000000000026' $$,
  'L132: un caissier repare une commande coincee (registre complet, statut partial)');
select throws_ok(
  $$ update public.orders set payment_status = 'paid', paid_at = now(), payment_method = 'cash'
       where id = '0a000000-0000-4000-8000-000000000024' $$,
  '42501', null, 'L132 temoin: registre a 400 sur 1000, la commande ne passe pas paid avec un moyen');
select throws_ok(
  $$ update public.orders set payment_status = 'paid', paid_at = now(), payment_method = 'cash'
       where id = '0a000000-0000-4000-8000-000000000025' $$,
  '42501', null, 'L132 temoin: statut NULL (pas partial), meme registre complet: regle d avant');
select throws_ok(
  $$ update public.orders set payment_method = 'card' where id = '0a000000-0000-4000-8000-000000000021' $$,
  '42501', null, 'L132 temoin: un caissier ne reetiquette pas en carte une commande payee en especes');
select throws_ok(
  $$ update public.orders set payment_method = 'cash' where id = '0a000000-0000-4000-8000-000000000022' $$,
  '42501', null, 'L132 temoin: pas de moyen pose sur une commande encore partial sans la solder');
select throws_ok(
  $$ update public.orders set payment_status = 'paid', payment_method = 'card'
       where id = '0a000000-0000-4000-8000-000000000023' $$,
  '42501', null, 'L132 temoin: pas de changement du moyen d une partial qui en a deja un');
-- Les autres gardes du declencheur ne sont pas affaiblies.
select throws_ok(
  $$ update public.orders set total = 1 where id = '0a000000-0000-4000-8000-000000000022' $$,
  '42501', null, 'L132 temoin: les montants restent figes');
select throws_ok(
  $$ update public.orders set tip_amount = 500 where id = '0a000000-0000-4000-8000-000000000022' $$,
  '42501', null, 'L132 temoin: pas de pourboire sur une commande deja partiellement reglee');
select throws_ok(
  $$ update public.orders set payment_status = 'pending' where id = '0a000000-0000-4000-8000-000000000021' $$,
  '42501', null, 'L132 temoin: une commande payee ne revient pas a pending');
reset role;
select is(
  (select payment_status || ':' || payment_method from public.orders where id = '0a000000-0000-4000-8000-000000000020'),
  'paid:cash', 'L132: la commande soldee par le caissier est paid, avec son moyen');

-- ------------------------------------------------ A17: suppression de tables
insert into public.venues (id, tenant_id, slug, name)
values ('ca000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'salle', 'Salle');
insert into public.zones (id, venue_id, tenant_id, name, prefix)
values
  ('da000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Interieur', 'INT'),
  ('da000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Terrasse', 'TER');
insert into public.tables (id, zone_id, tenant_id, table_number, display_name)
values
  ('ea000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'INT-1', 'Table 1'),
  ('ea000000-0000-4000-8000-000000000002', 'da000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'INT-2', 'Table 2'),
  ('ea000000-0000-4000-8000-000000000003', 'da000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', 'TER-1', 'Terrasse 1'),
  ('ea000000-0000-4000-8000-000000000004', 'da000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'INT-3', 'Table 3');
insert into public.table_sessions (tenant_id, table_number)
values
  ('aa000000-0000-4000-8000-000000000001', 'INT-1'),
  ('aa000000-0000-4000-8000-000000000001', 'TER-1'),
  ('aa000000-0000-4000-8000-000000000001', 'INT-3');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ delete from public.tables where id = 'ea000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'A17: le proprietaire ne supprime pas une table occupee par l API');
select lives_ok(
  $$ delete from public.tables where id = 'ea000000-0000-4000-8000-000000000002' $$,
  'A17 temoin: une table libre se supprime');
select throws_ok(
  $$ delete from public.zones where id = 'da000000-0000-4000-8000-000000000002' $$,
  '23514', null, 'A17: supprimer une zone dont une table est occupee est refuse (cascade jugee)');
reset role;
select ok(not exists (select 1 from public.tables where id = 'ea000000-0000-4000-8000-000000000002'),
  'A17 temoin: la table libre a bien disparu');

-- service_role: libre (suppression par la console, remise a zero)
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$ delete from public.tables where id = 'ea000000-0000-4000-8000-000000000004' $$,
  'A17: le service_role supprime une table meme occupee');
-- Type 'orders': le type 'all' reference inventory_movements, absente du
-- schema (defaut anterieur, hors de ce lot, signale au compte rendu).
select lives_ok(
  $$ select public.reset_tenant_data('aa000000-0000-4000-8000-000000000001', 'orders') $$,
  'A17: la remise a zero des commandes du restaurant reste possible');
reset role;
select lives_ok(
  $$ delete from public.tenants where id = 'aa000000-0000-4000-8000-000000000001' $$,
  'A17: la suppression d un restaurant cascade sur ses tables occupees');

select * from finish();
rollback;
