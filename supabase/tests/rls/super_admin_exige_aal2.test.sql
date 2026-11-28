-- Super administrateur: droits de plateforme seulement en aal2
-- (20261127210000, audit d'equipe du 2026-11-27, constat pentest P-1).
--
-- Avant la correction, un super administrateur SANS facteur verifie gardait
-- is_super_admin() = vrai avec un jeton aal1 (mot de passe seul), donc la
-- lecture de tous les restaurants et la garde de 17 fonctions RPC.
-- Temoins: le meme compte en aal2 retrouve ses droits; un super administrateur
-- AVEC facteur reste refuse en aal1 et accepte en aal2; sa propre ligne de
-- membre reste lisible en aal1 (routage vers l'enrolement du code).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f7000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa-sans-facteur@test.local', 'x', now(), now()),
  ('f7000000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sa-avec-facteur@test.local', 'x', now(), now()),
  ('f7000000-0000-4000-8000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'autre-proprio@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values
  ('f7000000-0000-4000-8000-00000000000a', 'aal2-plateforme', 'Plateforme', true, 'business', 'active'),
  -- Un restaurant par super administrateur: la base n'admet qu'un proprietaire
  -- par restaurant (index admin_users_un_proprietaire, refonte des roles).
  ('f7000000-0000-4000-8000-00000000000c', 'aal2-plateforme-bis', 'Plateforme bis', true, 'business', 'active'),
  ('f7000000-0000-4000-8000-00000000000b', 'aal2-autre', 'Autre restaurant', true, 'business', 'active');

set local request.jwt.claim.role = 'service_role';
insert into public.admin_users (tenant_id, user_id, email, role, is_active, is_super_admin)
values
  ('f7000000-0000-4000-8000-00000000000a', 'f7000000-0000-4000-8000-0000000000b1', 'sa-sans-facteur@test.local', 'owner', true, true),
  ('f7000000-0000-4000-8000-00000000000c', 'f7000000-0000-4000-8000-0000000000b2', 'sa-avec-facteur@test.local', 'owner', true, true),
  ('f7000000-0000-4000-8000-00000000000b', 'f7000000-0000-4000-8000-0000000000b3', 'autre-proprio@test.local', 'owner', true, false);
set local request.jwt.claim.role = '';

-- Facteur verifie pour le second super administrateur seulement.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('f7100000-0000-4000-8000-0000000000b2', 'f7000000-0000-4000-8000-0000000000b2', 'telephone', 'totp', 'verified', now(), now());

set local role authenticated;

-- 1. Super administrateur SANS facteur, jeton aal1: plus aucun droit de plateforme.
set local "request.jwt.claims" = '{"sub":"f7000000-0000-4000-8000-0000000000b1","role":"authenticated","aal":"aal1"}';
select is(public.is_super_admin(), false,
  'super administrateur sans facteur + aal1: pas de droits de plateforme (faille P-1 fermee)');
select is((select count(*) from public.tenants where id = 'f7000000-0000-4000-8000-00000000000b')::int, 0,
  'super administrateur sans facteur + aal1: un restaurant dont il n est pas membre reste cache');
select is((select count(*) from public.admin_users where user_id = 'f7000000-0000-4000-8000-0000000000b1')::int, 1,
  'super administrateur sans facteur + aal1: sa propre ligne reste lisible (routage vers le code)');

-- 2. Temoin: le meme compte en aal2 retrouve ses droits.
set local "request.jwt.claims" = '{"sub":"f7000000-0000-4000-8000-0000000000b1","role":"authenticated","aal":"aal2"}';
select is(public.is_super_admin(), true, 'super administrateur + aal2: droits de plateforme (temoin positif)');
select is((select count(*) from public.tenants where id = 'f7000000-0000-4000-8000-00000000000b')::int, 1,
  'super administrateur + aal2: il lit un restaurant dont il n est pas membre (temoin positif)');

-- 3. Super administrateur AVEC facteur: refuse en aal1, accepte en aal2.
set local "request.jwt.claims" = '{"sub":"f7000000-0000-4000-8000-0000000000b2","role":"authenticated","aal":"aal1"}';
select is(public.is_super_admin(), false, 'super administrateur avec facteur + aal1: refuse');
set local "request.jwt.claims" = '{"sub":"f7000000-0000-4000-8000-0000000000b2","role":"authenticated","aal":"aal2"}';
select is(public.is_super_admin(), true, 'super administrateur avec facteur + aal2: accepte');

-- 4. Un proprietaire ordinaire en aal2 n'est pas super administrateur.
set local "request.jwt.claims" = '{"sub":"f7000000-0000-4000-8000-0000000000b3","role":"authenticated","aal":"aal2"}';
select is(public.is_super_admin(), false, 'proprietaire ordinaire + aal2: pas super administrateur');

select * from finish();
rollback;
