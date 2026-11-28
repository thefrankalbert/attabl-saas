-- Double authentification et actes reserves au proprietaire : un proprietaire
-- protege par un facteur verifie, avec un jeton de niveau aal1 (mot de passe
-- seul), n'est PAS proprietaire pour la base.
--
-- POURQUOI CE TEST EXISTE. La double authentification est exigee par la base
-- depuis 20261124210700 : un attaquant qui connait le mot de passe d'un compte
-- protege obtient un jeton aal1 et appelle PostgREST sans jamais saisir le
-- code. Le lot 1 des roles ajoute de nouvelles fonctions de droit et une table
-- (`poste_permissions`) qui regle les droits de tout le personnel : si une
-- seule d'elles oubliait `mfa_satisfait()`, le mot de passe du proprietaire
-- suffirait a reecrire les droits du restaurant.
--
-- TEMOIN. Le meme proprietaire, memes requetes, jeton aal2 : tout passe. Et un
-- proprietaire SANS facteur verifie passe en aal1 (la garde ne ferme pas tout).
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

-- 1 proprietaire protege (facteur verifie) de A, 2 proprietaire sans facteur de B.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('ae000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'mfa' || g || '@test.local', 'x', now(), now()
from generate_series(1, 2) g;
insert into public.tenants (id, slug, name, is_active) values
  ('ae000000-0000-4000-8000-00000000000a', 'mfa-proprio-a', 'MFA Proprio A', true),
  ('ae000000-0000-4000-8000-00000000000b', 'mfa-proprio-b', 'MFA Proprio B', true);
insert into public.admin_users (tenant_id, user_id, email, postes, is_active) values
  ('ae000000-0000-4000-8000-00000000000a', 'ae000000-0000-4000-8000-000000000101', 'mfa1@test.local', '{owner}', true),
  ('ae000000-0000-4000-8000-00000000000b', 'ae000000-0000-4000-8000-000000000102', 'mfa2@test.local', '{owner}', true);
insert into auth.mfa_factors (id, user_id, factor_type, status)
values ('ae000000-0000-4000-8000-000000000301', 'ae000000-0000-4000-8000-000000000101', 'totp', 'verified');
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('ae000000-0000-4000-8000-00000000000a', 'cashier', '{"cash.close": true}');
insert into public.audit_log (tenant_id, action, entity_type)
values ('ae000000-0000-4000-8000-00000000000a', 'create', 'menu_item');

set local role authenticated;

-- ===========================================================================
-- aal1 : rien
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-000000000101","aal":"aal1"}';
select ok(not public.is_tenant_owner('ae000000-0000-4000-8000-00000000000a'),
  'aal1: is_tenant_owner est faux pour le proprietaire protege');
select is(public.tenant_permission_level('ae000000-0000-4000-8000-00000000000a', 'menu.view'), null,
  'aal1: tenant_permission_level rend NULL, meme pour menu.view');
select ok(not public.has_tenant_write_permission('ae000000-0000-4000-8000-00000000000a', 'settings.edit'),
  'aal1: has_tenant_write_permission est faux');
select is(public.tenants_avec_droit('audit.view'), '{}'::uuid[], 'aal1: tenants_avec_droit (entier) est vide');
select is(public.tenants_avec_droit('billing.manage', 'limited'), '{}'::uuid[], 'aal1: tenants_avec_droit (limite) est vide');
select ok(not public.has_tenant_money_permission('ae000000-0000-4000-8000-00000000000a')
      and not public.has_tenant_floor_permission('ae000000-0000-4000-8000-00000000000a'),
  'aal1: ni autorite d argent ni plan de salle');
select is((select count(*)::int from public.audit_log), 0, 'aal1: il ne lit pas le journal d audit');
select is((select count(*)::int from public.poste_permissions), 0, 'aal1: il ne lit pas les reglages de poste');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('ae000000-0000-4000-8000-00000000000a', 'waiter', '{"orders.pay": true}')$$,
  '42501', null, 'aal1: INSERT dans poste_permissions refuse');
update public.poste_permissions set permissions = '{"cash.close": false}'
 where tenant_id = 'ae000000-0000-4000-8000-00000000000a';
delete from public.poste_permissions where tenant_id = 'ae000000-0000-4000-8000-00000000000a';
reset role;
select is((select permissions from public.poste_permissions
            where tenant_id = 'ae000000-0000-4000-8000-00000000000a' and poste = 'cashier'),
  '{"cash.close": true}'::jsonb, 'aal1: UPDATE et DELETE dans poste_permissions touchent 0 ligne');
select is((select count(*)::int from public.poste_permissions where tenant_id = 'ae000000-0000-4000-8000-00000000000a'), 1,
  'aal1: aucun reglage cree');

-- Sans la mention `aal` dans le jeton : traite comme aal1.
set local role authenticated;
set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-000000000101"}';
select ok(not public.is_tenant_owner('ae000000-0000-4000-8000-00000000000a')
      and public.tenant_permission_level('ae000000-0000-4000-8000-00000000000a', 'menu.view') is null,
  'jeton sans aal: traite comme aal1');

-- ===========================================================================
-- aal2 : tout
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-000000000101","aal":"aal2"}';
select ok(public.is_tenant_owner('ae000000-0000-4000-8000-00000000000a'), 'aal2 temoin: is_tenant_owner est vrai');
select is(public.tenant_permission_level('ae000000-0000-4000-8000-00000000000a', 'billing.manage'), 'full',
  'aal2 temoin: tenant_permission_level rend full');
select is(public.tenants_avec_droit('audit.view'), array['ae000000-0000-4000-8000-00000000000a']::uuid[],
  'aal2 temoin: tenants_avec_droit rend son restaurant');
select is((select count(*)::int from public.audit_log), 1, 'aal2 temoin: il lit le journal d audit');
select lives_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('ae000000-0000-4000-8000-00000000000a', 'waiter', '{"orders.pay": true}')$$,
  'aal2 temoin: INSERT dans poste_permissions passe');
update public.poste_permissions set permissions = '{"cash.close": false}'
 where tenant_id = 'ae000000-0000-4000-8000-00000000000a' and poste = 'cashier';
select is((select permissions from public.poste_permissions where poste = 'cashier'),
  '{"cash.close": false}'::jsonb, 'aal2 temoin: UPDATE dans poste_permissions passe');

-- ===========================================================================
-- Proprietaire sans facteur verifie : aal1 suffit (rien ne change pour lui)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ae000000-0000-4000-8000-000000000102","aal":"aal1"}';
select ok(public.is_tenant_owner('ae000000-0000-4000-8000-00000000000b'),
  'sans facteur: un proprietaire non protege reste proprietaire en aal1');
select lives_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('ae000000-0000-4000-8000-00000000000b', 'waiter', '{"orders.pay": true}')$$,
  'sans facteur: il regle les droits de ses postes');

select * from finish();
rollback;
