-- Double authentification exigee par la base (20261124200000).
--
-- Un compte qui a un facteur TOTP verifie et un jeton aal1 (mot de passe
-- seul) n'a plus aucun droit de restaurant ni de plateforme par PostgREST:
-- has_tenant_write_permission, get_my_tenant_ids_array, is_super_admin rendent
-- faux ou vide, et la lecture directe des tables protegees ne rend rien.
-- Temoins: le meme compte en aal2 retrouve tous ses droits; un compte SANS
-- facteur en aal1 garde les siens (rien ne change pour lui); la lecture de
-- ses propres restaurants et de sa propre ligne de membre reste ouverte en
-- aal1, parce que la connexion en a besoin pour router apres le code.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f6000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'proprio-mfa@test.local', 'x', now(), now()),
  ('f6000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gerant-sans-mfa@test.local', 'x', now(), now()),
  ('f6000000-0000-4000-8000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin-mfa@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('f6000000-0000-4000-8000-00000000000a', 'mfa-a', 'MFA A', true, 'business', 'active');

-- Le declencheur prevent_super_admin_elevation n'accepte un super admin que
-- d'un appel service_role (claim legacy), comme dans les autres tests.
set local request.jwt.claim.role = 'service_role';
insert into public.admin_users (tenant_id, user_id, email, role, is_active, is_super_admin)
values
  ('f6000000-0000-4000-8000-00000000000a', 'f6000000-0000-4000-8000-0000000000a1', 'proprio-mfa@test.local', 'owner', true, false),
  ('f6000000-0000-4000-8000-00000000000a', 'f6000000-0000-4000-8000-0000000000a2', 'gerant-sans-mfa@test.local', 'manager', true, false),
  ('f6000000-0000-4000-8000-00000000000a', 'f6000000-0000-4000-8000-0000000000a3', 'superadmin-mfa@test.local', 'owner', true, true);
set local request.jwt.claim.role = '';

-- Facteurs TOTP VERIFIES pour le proprietaire et le super administrateur.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  ('f6100000-0000-4000-8000-0000000000a1', 'f6000000-0000-4000-8000-0000000000a1', 'telephone', 'totp', 'verified', now(), now()),
  ('f6100000-0000-4000-8000-0000000000a3', 'f6000000-0000-4000-8000-0000000000a3', 'telephone', 'totp', 'verified', now(), now());

-- Table reservee (inventory.view): la carte publique (categories, plats) ne
-- prouverait rien, elle est lisible par tous.
insert into public.suppliers (tenant_id, name, phone)
values ('f6000000-0000-4000-8000-00000000000a', 'Fournisseur MFA', '+22600000000');

set local role authenticated;

-- 1. Proprietaire AVEC facteur, jeton aal1: aucun droit.
set local "request.jwt.claims" = '{"sub":"f6000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}';
select is(public.mfa_satisfait(), false, 'facteur verifie + aal1: double authentification non satisfaite');
select is(public.has_tenant_write_permission('f6000000-0000-4000-8000-00000000000a', 'menu.edit'), false,
  'facteur verifie + aal1: aucun droit d ecriture, meme proprietaire');
select is(cardinality(public.get_my_tenant_ids_array()), 0, 'facteur verifie + aal1: aucun restaurant pour les politiques');
select is((select count(*) from public.suppliers)::int, 0, 'facteur verifie + aal1: les tables du restaurant ne rendent rien');
select is((select count(*) from public.tenants where id = 'f6000000-0000-4000-8000-00000000000a')::int, 1,
  'facteur verifie + aal1: son restaurant reste lisible (routage apres le code)');
select is((select count(*) from public.admin_users where user_id = 'f6000000-0000-4000-8000-0000000000a1')::int, 1,
  'facteur verifie + aal1: sa propre ligne de membre reste lisible');

-- 2. Meme proprietaire, jeton aal2 (code saisi): tous ses droits.
set local "request.jwt.claims" = '{"sub":"f6000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2"}';
select is(public.mfa_satisfait(), true, 'facteur verifie + aal2: satisfaite');
select is(public.has_tenant_write_permission('f6000000-0000-4000-8000-00000000000a', 'menu.edit'), true,
  'facteur verifie + aal2: droit d ecriture retrouve (temoin)');
select is((select count(*) from public.suppliers)::int, 1, 'facteur verifie + aal2: les tables du restaurant se lisent (temoin)');

-- 3. Gerant SANS facteur, jeton aal1: rien ne change pour lui.
set local "request.jwt.claims" = '{"sub":"f6000000-0000-4000-8000-0000000000a2","role":"authenticated","aal":"aal1"}';
select is(public.mfa_satisfait(), true, 'sans facteur: satisfaite en aal1');
select is(public.has_tenant_write_permission('f6000000-0000-4000-8000-00000000000a', 'menu.edit'), true,
  'sans facteur: ses droits restent intacts en aal1');
select is((select count(*) from public.suppliers)::int, 1, 'sans facteur: il lit les tables de son restaurant en aal1');

-- 4. Super administrateur AVEC facteur.
set local "request.jwt.claims" = '{"sub":"f6000000-0000-4000-8000-0000000000a3","role":"authenticated","aal":"aal1"}';
select is(public.is_super_admin(), false, 'super administrateur + aal1: pas de droits de plateforme');
set local "request.jwt.claims" = '{"sub":"f6000000-0000-4000-8000-0000000000a3","role":"authenticated","aal":"aal2"}';
select is(public.is_super_admin(), true, 'super administrateur + aal2: droits de plateforme (temoin)');

-- 5. Un facteur NON verifie (enrolement abandonne) ne bloque rien.
reset role;
update auth.mfa_factors set status = 'unverified' where id = 'f6100000-0000-4000-8000-0000000000a1';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"f6000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}';
select is(public.mfa_satisfait(), true, 'facteur non verifie: aucun blocage en aal1');

-- 6. La fonction garde les privileges d'une aide de politique RLS.
reset role;
select ok(
  has_function_privilege('anon', 'public.mfa_satisfait()', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.mfa_satisfait()', 'EXECUTE'),
  'mfa_satisfait reste executable par anon et authenticated (aide de RLS)');

select * from finish();
rollback;
