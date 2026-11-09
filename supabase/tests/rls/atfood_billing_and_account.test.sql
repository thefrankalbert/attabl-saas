-- Colonnes de facturation fermees aux utilisateurs connectes + suppression de compte Atfood.
--
-- Doit echouer si quelqu'un regrant les identifiants Stripe a `authenticated`, ou ouvre
-- delete_my_account() a anon.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/atfood_billing_and_account.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

-- ------------------------------------------------- facturation, role authenticated
set local role authenticated;

select throws_ok(
  'select stripe_customer_id from public.tenants limit 1',
  '42501', null,
  'authenticated ne peut pas lire tenants.stripe_customer_id'
);
select throws_ok(
  'select stripe_subscription_id from public.tenants limit 1',
  '42501', null,
  'authenticated ne peut pas lire tenants.stripe_subscription_id'
);
select throws_ok(
  'select activation_events from public.tenants limit 1',
  '42501', null,
  'authenticated ne peut pas lire tenants.activation_events'
);
select lives_ok(
  'select id, slug, name, currency, subscription_status from public.tenants limit 1',
  'authenticated lit toujours les colonnes utiles au dashboard'
);

reset role;

-- ------------------------------------------------- suppression de compte
select ok(
  has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'),
  'authenticated peut appeler delete_my_account()'
);
select ok(
  not has_function_privilege('anon', 'public.delete_my_account()', 'execute'),
  'anon ne peut pas appeler delete_my_account()'
);

set local role authenticated;
select is(
  public.delete_my_account(),
  'not_authenticated',
  'sans session, delete_my_account() ne supprime rien'
);
reset role;

select * from finish();
rollback;
