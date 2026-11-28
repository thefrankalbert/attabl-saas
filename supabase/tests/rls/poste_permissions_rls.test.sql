-- poste_permissions : lecture par les membres, ecriture par le seul
-- proprietaire, contenu borne par le catalogue.
--
-- POURQUOI CE TEST EXISTE. Cette table porte les droits de TOUT un poste dans
-- un restaurant. Qui peut l'ecrire peut se donner, par son poste, n'importe
-- quel droit. `authenticated` y a INSERT, UPDATE et DELETE : seules les quatre
-- politiques et les CHECK retiennent un employe.
--
-- TEMOIN. Chaque refus est mesure par le nombre de lignes avant et apres (un
-- UPDATE ou un DELETE refuse par la RLS ne leve aucune erreur), et la meme
-- ecriture passe pour le proprietaire.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

-- 1 proprietaire de A, 2 gerant de A, 3 serveur de A, 4 proprietaire de B.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a7000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'reglage' || g || '@test.local', 'x', now(), now()
from generate_series(1, 4) g;
insert into public.tenants (id, slug, name, is_active) values
  ('a7000000-0000-4000-8000-00000000000a', 'reglage-a', 'Reglage A', true),
  ('a7000000-0000-4000-8000-00000000000b', 'reglage-b', 'Reglage B', true);
insert into public.admin_users (tenant_id, user_id, email, postes, is_active) values
  ('a7000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-000000000101', 'reglage1@test.local', '{owner}', true),
  ('a7000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-000000000102', 'reglage2@test.local', '{manager}', true),
  ('a7000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-000000000103', 'reglage3@test.local', '{waiter}', true),
  ('a7000000-0000-4000-8000-00000000000b', 'a7000000-0000-4000-8000-000000000104', 'reglage4@test.local', '{owner}', true);
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('a7000000-0000-4000-8000-00000000000a', 'cashier', '{"cash.close": true}'::jsonb);

select ok((select relrowsecurity from pg_class where oid = 'public.poste_permissions'::regclass),
  'RLS active sur poste_permissions');

-- ===========================================================================
-- Lecture
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000103"}';
select is((select count(*)::int from public.poste_permissions), 1,
  'lecture: un serveur lit les reglages de SON restaurant (l interface en a besoin)');
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000104"}';
select is((select count(*)::int from public.poste_permissions), 0,
  'lecture: le proprietaire d un AUTRE restaurant ne lit rien');
reset role;
set local role anon;
select throws_ok('select count(*) from public.poste_permissions', '42501', null,
  'lecture: anon n a aucun privilege sur la table');
reset role;

-- ===========================================================================
-- Ecriture : le gerant non, meme avec team.manage et settings.edit
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000102"}';
select ok(public.has_tenant_write_permission('a7000000-0000-4000-8000-00000000000a', 'team.manage')
      and public.has_tenant_write_permission('a7000000-0000-4000-8000-00000000000a', 'settings.edit'),
  'temoin: le gerant a bien team.manage et settings.edit');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'manager', '{"billing.manage": true}')$$,
  '42501', null, 'ecriture: un gerant ne se donne PAS billing.manage par le reglage de son poste');
update public.poste_permissions set permissions = '{"cash.close": false}'::jsonb
 where tenant_id = 'a7000000-0000-4000-8000-00000000000a';
delete from public.poste_permissions where tenant_id = 'a7000000-0000-4000-8000-00000000000a';
reset role;
select is((select permissions from public.poste_permissions
            where tenant_id = 'a7000000-0000-4000-8000-00000000000a' and poste = 'cashier'),
  '{"cash.close": true}'::jsonb,
  'ecriture: l UPDATE et le DELETE du gerant ont touche 0 ligne');

-- ===========================================================================
-- Ecriture : le proprietaire oui, chez lui seulement
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000101"}';
select lives_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'manager', '{"billing.manage": true}')$$,
  'ecriture: le proprietaire cree un reglage de poste');
update public.poste_permissions set permissions = '{"cash.close": false}'::jsonb
 where tenant_id = 'a7000000-0000-4000-8000-00000000000a' and poste = 'cashier';
select is((select permissions from public.poste_permissions where poste = 'cashier'),
  '{"cash.close": false}'::jsonb, 'ecriture: le proprietaire modifie un reglage');
delete from public.poste_permissions
 where tenant_id = 'a7000000-0000-4000-8000-00000000000a' and poste = 'cashier';
select is((select count(*)::int from public.poste_permissions where poste = 'cashier'), 0,
  'ecriture: le proprietaire supprime un reglage');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000b', 'manager', '{"menu.edit": false}')$$,
  '42501', null, 'WITH CHECK: le proprietaire de A n insere pas une ligne pour B');
select throws_ok(
  $$update public.poste_permissions set tenant_id = 'a7000000-0000-4000-8000-00000000000b' where poste = 'manager'$$,
  '42501', null, 'WITH CHECK: il ne deplace pas une ligne vers B');

-- L'effet du reglage : le gerant a maintenant billing.manage en entier.
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000102"}';
select ok(public.has_tenant_write_permission('a7000000-0000-4000-8000-00000000000a', 'billing.manage'),
  'effet: le reglage pose par le proprietaire est lu par la resolution');

-- ===========================================================================
-- Contenu : borne par le catalogue, meme pour le proprietaire
-- ===========================================================================
set local request.jwt.claims = '{"sub":"a7000000-0000-4000-8000-000000000101"}';
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'chef', '{"orders.manage": true}')$$,
  '23514', null, 'contenu: une cle hors catalogue (ancien code) est refusee');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'chef', '{"menu.edit": "oui"}')$$,
  '23514', null, 'contenu: une valeur non booleenne est refusee');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'chef', '["menu.edit"]')$$,
  '23514', null, 'contenu: un tableau JSON est refuse proprement (pas d erreur de jsonb_each)');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'owner', '{"menu.edit": false}')$$,
  '23514', null, 'contenu: on ne regle pas le poste du proprietaire');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'admin', '{"menu.edit": false}')$$,
  '23514', null, 'contenu: l ancien role admin n est pas un poste');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'manager', '{"menu.edit": false}')$$,
  '23505', null, 'contenu: un seul reglage par poste et par restaurant');
select lives_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('a7000000-0000-4000-8000-00000000000a', 'chef', '{"menu.price": false, "cash.count": true}')$$,
  'temoin: un reglage valide passe');

select * from finish();
rollback;
