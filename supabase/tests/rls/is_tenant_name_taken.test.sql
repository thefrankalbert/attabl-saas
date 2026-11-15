-- A-08: la pre-verification du nom de restaurant a l'inscription lit les
-- restaurants des AUTRES comptes (cachés par le RLS), donc c'est une SECURITY
-- DEFINER. Ce test verrouille deux choses:
--   1. elle n'est executable que par service_role (sinon n'importe quel client
--      pourrait sonder les noms de restaurants);
--   2. son predicat est celui du declencheur enforce_tenant_name_cross_group_unique:
--      casse et espaces de bord ignores, restaurants supprimes ou non etablis
--      ignores.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/is_tenant_name_taken.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select ok(not has_function_privilege('anon', 'public.is_tenant_name_taken(text)', 'EXECUTE'),
  'anon ne peut pas executer is_tenant_name_taken');
select ok(not has_function_privilege('authenticated', 'public.is_tenant_name_taken(text)', 'EXECUTE'),
  'authenticated ne peut pas executer is_tenant_name_taken');
select ok(has_function_privilege('service_role', 'public.is_tenant_name_taken(text)', 'EXECUTE'),
  'service_role peut executer is_tenant_name_taken');
select ok(
  (select prosecdef from pg_proc where oid = 'public.is_tenant_name_taken(text)'::regprocedure),
  'is_tenant_name_taken est SECURITY DEFINER');
select ok(
  coalesce((select proconfig from pg_proc
            where oid = 'public.is_tenant_name_taken(text)'::regprocedure) @> array['search_path=""'], false),
  'is_tenant_name_taken epingle son search_path a vide');

-- Jeu d'essai: un groupe et trois restaurants (etabli, supprime, non etabli).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('11111111-1111-1111-1111-1111111111a1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'proprio@test.local', 'x', now(), now());
insert into public.restaurant_groups (id, owner_user_id, name)
values ('22222222-2222-2222-2222-2222222222a2', '11111111-1111-1111-1111-1111111111a1', 'Groupe test');

insert into public.tenants (id, slug, name, is_active, group_id, onboarding_completed, deleted_at)
values
  ('33333333-3333-3333-3333-3333333333a1', 'etabli-a8', 'Chez Awa', true,
   '22222222-2222-2222-2222-2222222222a2', true, null),
  ('33333333-3333-3333-3333-3333333333a2', 'supprime-a8', 'Le Baobab', true,
   '22222222-2222-2222-2222-2222222222a2', true, now()),
  ('33333333-3333-3333-3333-3333333333a3', 'brouillon-a8', 'La Terrasse', true,
   '22222222-2222-2222-2222-2222222222a2', false, null);

select ok(public.is_tenant_name_taken('Chez Awa'), 'un nom etabli est pris');
select ok(public.is_tenant_name_taken('  chez AWA '), 'casse et espaces de bord ignores (comme le declencheur)');
select ok(not public.is_tenant_name_taken('Le Baobab'), 'un restaurant supprime ne reserve pas son nom');
select ok(not public.is_tenant_name_taken('La Terrasse'), 'un restaurant non etabli ne reserve pas son nom');
select ok(not public.is_tenant_name_taken('Chez Aw_'), 'aucun joker: "_" n est pas un caractere generique');

select * from finish();
rollback;
