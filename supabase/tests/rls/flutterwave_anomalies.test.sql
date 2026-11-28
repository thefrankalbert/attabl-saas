-- Anomalies Flutterwave (20261124130000): isolation et forme de la table.
--
-- CE QUE CE TEST VERROUILLE. La table liste l'argent encaisse a rembourser et
-- les ecarts avec Flutterwave: une donnee de la PLATEFORME. Seuls le super
-- administrateur (lecture) et service_role (ecriture) y accedent. Un
-- proprietaire de restaurant, un membre ou anon n'y lisent RIEN, pas meme les
-- lignes de leur propre restaurant, et personne n'ecrit par l'API.
--
-- MESURE ANTI-FAUX-VERT: chaque refus de lecture a son TEMOIN (le super admin
-- lit les memes lignes), chaque refus d'ecriture est relu en superutilisateur.
--
-- Execution: scripts/run-pgtap.sh --local (ou la CI .github/workflows/pgtap.yml)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron.anomalies@test.local', 'x', now(), now()),
  ('f2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'super.anomalies@test.local', 'x', now(), now()),
  ('f3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ancien.super.anomalies@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active) values
  ('f5555555-5555-4555-8555-555555555555', 'tenant-anomalies', 'Resto Anomalies', true);

set local request.jwt.claim.role = 'service_role';
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, is_super_admin) values
  ('fa000000-0000-4000-8000-00000000000a', 'f5555555-5555-4555-8555-555555555555',
   'f1111111-1111-1111-1111-111111111111', 'patron.anomalies@test.local', 'owner', true, false),
  ('fb000000-0000-4000-8000-00000000000b', 'f5555555-5555-4555-8555-555555555555',
   'f2222222-2222-2222-2222-222222222222', 'super.anomalies@test.local', 'super_admin', true, true),
  -- Super administrateur REVOQUE: is_super_admin() le refuse (T-06).
  ('fc000000-0000-4000-8000-00000000000c', 'f5555555-5555-4555-8555-555555555555',
   'f3333333-3333-3333-3333-333333333333', 'ancien.super.anomalies@test.local', 'super_admin', false, true);
set local request.jwt.claim.role = '';

insert into public.flutterwave_payments
  (id, tenant_id, tx_ref, plan, billing_interval, amount, currency, status, flw_transaction_id,
   period_start, period_end)
values
  ('fd000000-0000-4000-8000-00000000000d', 'f5555555-5555-4555-8555-555555555555',
   'atb_anomalies_1', 'pro', 'monthly', 79000, 'XOF', 'successful', 88001,
   now(), now() + interval '1 month');

insert into public.flutterwave_anomalies
  (tenant_id, payment_id, flw_transaction_id, tx_ref, kind, reason, amount, currency)
values
  ('f5555555-5555-4555-8555-555555555555', 'fd000000-0000-4000-8000-00000000000d', 88002,
   'atb_anomalies_1', 'refund_due', 'ALREADY_SETTLED_BY_OTHER_TRANSACTION', 79000, 'XOF'),
  ('f5555555-5555-4555-8555-555555555555', 'fd000000-0000-4000-8000-00000000000d', 88001,
   'atb_anomalies_1', 'provider_mismatch', 'statut reversed', 79000, 'XOF');

-- ===========================================================================
-- 1. Forme (8)
-- ===========================================================================
select is(
  (select relrowsecurity from pg_class where oid = 'public.flutterwave_anomalies'::regclass),
  true, 'la RLS est active sur flutterwave_anomalies');
select is(
  (select count(*)::int from pg_policy where polrelid = 'public.flutterwave_anomalies'::regclass),
  1, 'une seule policy: aucune policy d ecriture');
select is(
  (select polcmd from pg_policy where polrelid = 'public.flutterwave_anomalies'::regclass),
  'r'::"char", 'la policy est une policy de LECTURE');
select is(has_table_privilege('anon', 'public.flutterwave_anomalies', 'select'), false,
  'anon n a aucun privilege de lecture');
select is(has_table_privilege('authenticated', 'public.flutterwave_anomalies', 'insert'), false,
  'authenticated ne peut pas inserer');
select is(has_table_privilege('authenticated', 'public.flutterwave_anomalies', 'update'), false,
  'authenticated ne peut pas modifier');
select is(has_table_privilege('authenticated', 'public.flutterwave_anomalies', 'delete'), false,
  'authenticated ne peut pas supprimer');
select is(has_table_privilege('service_role', 'public.flutterwave_anomalies', 'insert'), true,
  'TEMOIN: service_role ecrit');

-- ===========================================================================
-- 2. Contraintes (5)
-- ===========================================================================
select throws_ok(
  $$insert into public.flutterwave_anomalies (flw_transaction_id, kind, reason)
    values (88002, 'refund_due', 'rejeu')$$,
  '23505', null,
  'UNIQUE (transaction, type): un rejeu n ajoute pas de doublon');
select lives_ok(
  $$insert into public.flutterwave_anomalies (flw_transaction_id, kind, reason)
    values (88002, 'paid_period_not_active', 'restaurant frozen')$$,
  'TEMOIN: meme transaction, AUTRE type: accepte');
select throws_ok(
  $$insert into public.flutterwave_anomalies (flw_transaction_id, kind, reason)
    values (88003, 'type_invente', 'x')$$,
  '23514', null,
  'un type hors liste est refuse');
select throws_ok(
  $$insert into public.flutterwave_anomalies (flw_transaction_id, kind, reason, amount)
    values (88004, 'refund_due', 'x', -1)$$,
  '23514', null,
  'un montant negatif est refuse');
select throws_ok(
  $$insert into public.flutterwave_anomalies (flw_transaction_id, kind, reason)
    values (88005, 'refund_due', '')$$,
  '23514', null,
  'une raison vide est refusee');

-- ===========================================================================
-- 3. Lecture: super admin seulement (6)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222"}';
select is((select count(*)::int from public.flutterwave_anomalies), 3,
  'TEMOIN: le super administrateur lit toutes les anomalies');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';
select is((select count(*)::int from public.flutterwave_anomalies), 0,
  'le proprietaire du restaurant ne lit AUCUNE anomalie, meme les siennes');
select is(
  (select count(*)::int from public.flutterwave_payments
    where tenant_id = 'f5555555-5555-4555-8555-555555555555'),
  1, 'TEMOIN: ce meme proprietaire lit bien sa tentative de paiement (session valide)');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3333333-3333-3333-3333-333333333333"}';
select is((select count(*)::int from public.flutterwave_anomalies), 0,
  'un super administrateur REVOQUE ne lit plus rien');
reset role;

set local role anon;
select throws_ok(
  $$select count(*) from public.flutterwave_anomalies$$,
  '42501', null,
  'anon: aucun acces');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000099"}';
select is((select count(*)::int from public.flutterwave_anomalies), 0,
  'un compte connecte sans aucun role ne lit rien');
reset role;

-- ===========================================================================
-- 4. Ecriture par l'API: refusee, etat relu (3)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222"}';
select throws_ok(
  $$update public.flutterwave_anomalies set resolved_at = now()$$,
  '42501', null,
  'meme le super administrateur ne modifie pas par l API (pas de privilege UPDATE)');
select throws_ok(
  $$delete from public.flutterwave_anomalies$$,
  '42501', null,
  'personne ne supprime une dette de remboursement par l API');
reset role;
select is(
  (select count(*)::int from public.flutterwave_anomalies where resolved_at is null),
  3, 'etat relu: les 3 anomalies sont intactes et non resolues');

select * from finish();
rollback;
