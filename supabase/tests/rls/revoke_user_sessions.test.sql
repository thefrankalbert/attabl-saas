-- A-04: la fonction qui coupe les sessions d'un compte est une SECURITY DEFINER
-- sur le schema auth. Elle ne doit etre appelable que par le client service_role:
-- si anon ou authenticated pouvaient l'executer, n'importe qui pourrait deconnecter
-- n'importe quel compte en connaissant son identifiant.
--
-- Ce test verrouille quatre faits de la base, qu'un test applicatif ne peut pas voir:
--   1. anon et authenticated N'ONT PAS le droit d'executer;
--   2. service_role l'a;
--   3. la fonction est SECURITY DEFINER;
--   4. son search_path est epingle (une fonction definer au search_path libre est
--      detournable par un objet du meme nom dans un schema que l'appelant controle).
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/revoke_user_sessions.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

select ok(
  not has_function_privilege('anon', 'public.revoke_user_sessions(uuid)', 'EXECUTE'),
  'anon ne peut pas executer revoke_user_sessions'
);

select ok(
  not has_function_privilege('authenticated', 'public.revoke_user_sessions(uuid)', 'EXECUTE'),
  'authenticated ne peut pas executer revoke_user_sessions'
);

select ok(
  has_function_privilege('service_role', 'public.revoke_user_sessions(uuid)', 'EXECUTE'),
  'service_role peut executer revoke_user_sessions'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.revoke_user_sessions(uuid)'::regprocedure),
  'revoke_user_sessions est SECURITY DEFINER'
);

select ok(
  coalesce(
    (select proconfig from pg_proc where oid = 'public.revoke_user_sessions(uuid)'::regprocedure)
      @> array['search_path=""'],
    false
  ),
  'revoke_user_sessions epingle son search_path a vide'
);

select * from finish();
rollback;
