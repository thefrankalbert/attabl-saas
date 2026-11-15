-- Registre des paiements Flutterwave: lecture par les membres, ecriture par personne d'autre que service_role.
--
-- CE QUE CE TEST VERROUILLE. La table porte le prix attendu et l'etat regle d'un
-- paiement d'abonnement. Si un role client pouvait y ecrire, un restaurant
-- pourrait se declarer "successful" et se faire prolonger sans payer. Les
-- privileges par defaut du schema accordent tout a anon et authenticated: la
-- migration les retire, et ce test mesure que c'est bien le cas, sur le
-- COMPORTEMENT (insertion refusee, lecture cloisonnee) et pas seulement la forme.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/flutterwave_payments.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into public.tenants (id, slug, name, is_active, currency, subscription_status) values
  ('ffff1111-0000-0000-0000-00000000000a', 'flw-a', 'Resto A', true, 'XOF', 'active'),
  ('ffff2222-0000-0000-0000-00000000000b', 'flw-b', 'Resto B', true, 'XAF', 'active');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('ffee1111-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'flw-a@exemple.test', 'x', now(), now()),
  ('ffee2222-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'flw-b@exemple.test', 'x', now(), now());

insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('ffdd1111-0000-0000-0000-00000000000a', 'ffee1111-0000-0000-0000-00000000000a',
   'ffff1111-0000-0000-0000-00000000000a', 'flw-a@exemple.test', 'owner', true),
  ('ffdd2222-0000-0000-0000-00000000000b', 'ffee2222-0000-0000-0000-00000000000b',
   'ffff2222-0000-0000-0000-00000000000b', 'flw-b@exemple.test', 'owner', true);

-- Deux lignes reglees, une par restaurant (ecrites en superuser, comme le ferait service_role).
insert into public.flutterwave_payments
  (tenant_id, tx_ref, flw_transaction_id, plan, billing_interval, amount, currency, status, period_start, period_end)
values
  ('ffff1111-0000-0000-0000-00000000000a', 'atb_ref_a', 1001, 'pro', 'monthly', 79000, 'XOF', 'successful', now(), now() + interval '1 month'),
  ('ffff2222-0000-0000-0000-00000000000b', 'atb_ref_b', 1002, 'starter', 'monthly', 39000, 'XAF', 'successful', now(), now() + interval '1 month');

-- Forme: RLS active, une seule policy, en lecture.
select is(
  (select relrowsecurity from pg_class where oid = 'public.flutterwave_payments'::regclass),
  true,
  'la RLS est active sur flutterwave_payments');

select is(
  (select count(*)::int from pg_policy where polrelid = 'public.flutterwave_payments'::regclass),
  1,
  'une seule policy: aucune policy d ecriture');

select is(
  (select polcmd from pg_policy where polrelid = 'public.flutterwave_payments'::regclass),
  'r'::"char",
  'la policy est une policy de LECTURE');

select is(has_table_privilege('authenticated', 'public.flutterwave_payments', 'insert'), false,
  'authenticated ne peut pas inserer');
select is(has_table_privilege('authenticated', 'public.flutterwave_payments', 'update'), false,
  'authenticated ne peut pas modifier');
select is(has_table_privilege('anon', 'public.flutterwave_payments', 'select'), false,
  'anon ne lit rien');

-- Contraintes: un doublon de reference, de transaction, ou une devise inconnue est refuse.
select throws_ok(
  $$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
    values ('ffff1111-0000-0000-0000-00000000000a', 'atb_ref_a', 'pro', 'monthly', 79000, 'XOF')$$,
  '23505', NULL, 'tx_ref est unique');

select throws_ok(
  $$insert into public.flutterwave_payments (tenant_id, tx_ref, flw_transaction_id, plan, billing_interval, amount, currency, status, period_start, period_end)
    values ('ffff1111-0000-0000-0000-00000000000a', 'atb_ref_c', 1001, 'pro', 'monthly', 79000, 'XOF', 'successful', now(), now())$$,
  '23505', NULL, 'flw_transaction_id est unique: une transaction ne paie qu une fois');

select throws_ok(
  $$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
    values ('ffff1111-0000-0000-0000-00000000000a', 'atb_ref_d', 'pro', 'monthly', 79000, 'EUR')$$,
  '23514', NULL, 'seules XOF et XAF sont acceptees');

-- Comportement: un membre lit ses lignes et celles-la seulement.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"ffee1111-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select array_agg(tx_ref order by tx_ref) from public.flutterwave_payments),
  array['atb_ref_a'],
  'le membre du restaurant A ne voit que ses paiements');

select throws_ok(
  $$insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
    values ('ffff1111-0000-0000-0000-00000000000a', 'atb_ref_e', 'pro', 'monthly', 1, 'XOF')$$,
  '42501', NULL, 'un membre ne peut pas ecrire dans son propre registre');

reset role;
select is(
  (select count(*)::int from public.flutterwave_payments),
  2,
  'non-regression: les deux lignes existent toujours (rien n a ete efface)');

select * from finish();
rollback;
