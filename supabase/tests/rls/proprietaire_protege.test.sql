-- Protections du proprietaire en base : un seul par restaurant, son poste ne
-- se donne ni ne se retire, sa ligne ne se supprime pas tant que le restaurant
-- vit.
--
-- POURQUOI CE TEST EXISTE. Avant le lot 1 des roles, aucune garde en base : les
-- actions d'equipe ecrivent en service_role, que la RLS ne couvre pas. Une
-- faute dans une action suffisait a promouvoir un gerant en proprietaire, ou a
-- laisser un restaurant sans proprietaire. Trois verrous, verifies ici : un
-- index unique, des CHECK, et le declencheur garder_proprietaire_trg, qui vaut
-- pour TOUT LE MONDE, service_role compris.
--
-- LA CASCADE (preuve P1 de la conception). "Le dernier membre supprime son
-- restaurant" passe par delete_admin_user_atomic, qui supprime le restaurant
-- puis laisse la cascade effacer la ligne du proprietaire. La garde doit
-- laisser passer CE chemin : il est donc exerce par la vraie fonction, pas par
-- un simple DELETE FROM tenants.
--
-- TEMOINS. Chaque refus verifie son code (42501 du declencheur, 23505 de
-- l'index, 23514 d'un CHECK) et compte les lignes avant et apres. Et les memes
-- gestes PASSENT sur un gerant : la garde ne bloque pas tout.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

-- Restaurant A : 1 proprietaire, 2 gerant, 3 serveur.
-- Restaurant S (seul) : 4 proprietaire, unique membre.
-- Restaurant F (ferme) : 5 proprietaire.
-- 6 : compte sans restaurant, candidat second proprietaire de A.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('a8000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'proprio' || g || '@test.local', 'x', now(), now()
from generate_series(1, 6) g;
insert into public.tenants (id, slug, name, is_active) values
  ('a8000000-0000-4000-8000-00000000000a', 'proprio-a', 'Proprio A', true),
  ('a8000000-0000-4000-8000-00000000000b', 'proprio-seul', 'Proprio Seul', true),
  ('a8000000-0000-4000-8000-00000000000c', 'proprio-ferme', 'Proprio Ferme', true);
insert into public.admin_users (id, tenant_id, user_id, email, postes, is_active) values
  ('a8000000-0000-4000-8000-000000000201', 'a8000000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-000000000101', 'proprio1@test.local', '{owner}', true),
  ('a8000000-0000-4000-8000-000000000202', 'a8000000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-000000000102', 'proprio2@test.local', '{manager}', true),
  ('a8000000-0000-4000-8000-000000000203', 'a8000000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-000000000103', 'proprio3@test.local', '{waiter}', true),
  ('a8000000-0000-4000-8000-000000000204', 'a8000000-0000-4000-8000-00000000000b', 'a8000000-0000-4000-8000-000000000104', 'proprio4@test.local', '{owner}', true),
  ('a8000000-0000-4000-8000-000000000205', 'a8000000-0000-4000-8000-00000000000c', 'a8000000-0000-4000-8000-000000000105', 'proprio5@test.local', '{owner}', true);
update public.tenants set deleted_at = now() where id = 'a8000000-0000-4000-8000-00000000000c';

-- delete_admin_user_atomic (SECURITY DEFINER) efface le compte dans auth.users
-- avec les droits de son proprietaire. En production ce role les a. Sur un banc
-- ou la table auth.users de test appartient a un autre role, on les lui donne
-- le temps du test (annule avec la transaction) : sans cela le test echouerait
-- sur un privilege du banc, pas sur la garde qu'il mesure.
do $droits$
begin
  execute format('grant select, delete on auth.users to %I',
    (select pg_get_userbyid(p.proowner) from pg_proc p
      where p.oid = 'public.delete_admin_user_atomic(uuid, uuid)'::regprocedure));
end
$droits$;

select is((select role from public.admin_users where id = 'a8000000-0000-4000-8000-000000000201'), 'owner',
  'projection: postes = {owner} donne role = owner (les fonctions qui lisent encore role restent justes)');

-- ===========================================================================
-- 1. Le poste owner ne se donne pas
-- ===========================================================================
select throws_ok(
  $$update public.admin_users set postes = '{owner,manager}' where id = 'a8000000-0000-4000-8000-000000000202'$$,
  '42501', 'the owner poste cannot be granted or removed',
  'octroi: ajouter owner aux postes d un gerant est refuse (superutilisateur)');
select throws_ok(
  $$update public.admin_users set role = 'owner' where id = 'a8000000-0000-4000-8000-000000000202'$$,
  '42501', 'the owner poste cannot be granted or removed',
  'octroi: role = owner par UPDATE (ecriture de l ancien code) est refuse');

set local role service_role;
select throws_ok(
  $$update public.admin_users set postes = '{owner}' where id = 'a8000000-0000-4000-8000-000000000202'$$,
  '42501', 'the owner poste cannot be granted or removed',
  'octroi: refuse aussi en service_role (le role des actions d equipe)');
select throws_ok(
  $$update public.admin_users set role = 'owner' where id = 'a8000000-0000-4000-8000-000000000203'$$,
  '42501', 'the owner poste cannot be granted or removed',
  'octroi: role = owner refuse aussi en service_role');
select lives_ok(
  $$update public.admin_users set postes = '{manager,cashier}' where id = 'a8000000-0000-4000-8000-000000000202'$$,
  'temoin: changer les postes d un gerant pour d autres postes passe');
reset role;
select is((select postes from public.admin_users where id = 'a8000000-0000-4000-8000-000000000202'),
  '{manager,cashier}'::text[], 'octroi: apres les quatre tentatives, le gerant ne porte pas owner');

-- Second proprietaire par INSERT : l'index unique.
select throws_ok(
  $$insert into public.admin_users (tenant_id, user_id, email, postes, is_active)
    values ('a8000000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-000000000106', 'proprio6@test.local', '{owner}', true)$$,
  '23505', null, 'unicite: un second proprietaire par INSERT (nouveau format) est refuse');
select throws_ok(
  $$insert into public.admin_users (tenant_id, user_id, email, role, is_active)
    values ('a8000000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-000000000106', 'proprio6@test.local', 'owner', true)$$,
  '23505', null, 'unicite: un second proprietaire par INSERT (ancien format, role seul) est refuse');
select lives_ok(
  $$insert into public.admin_users (tenant_id, user_id, email, postes, is_active)
    values ('a8000000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-000000000106', 'proprio6@test.local', '{cook}', true)$$,
  'temoin: le meme compte entre comme cuisinier');
select throws_ok(
  $$insert into public.admin_users (tenant_id, user_id, email, postes, is_active)
    values ('a8000000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-000000000106', 'autre6@test.local', '{waiter}', true)$$,
  '23505', null, 'unicite: une seule ligne vivante par personne et par restaurant');

-- Invitation : owner n'est jamais invitable.
select throws_ok(
  $$insert into public.invitations (tenant_id, email, postes, invited_by, token, expires_at)
    values ('a8000000-0000-4000-8000-00000000000a', 'futur@test.local', '{owner}',
            'a8000000-0000-4000-8000-000000000201', 'jeton-owner', now() + interval '1 day')$$,
  '23514', null, 'invitation: le poste owner est refuse par le CHECK');
select lives_ok(
  $$insert into public.invitations (tenant_id, email, postes, invited_by, token, expires_at)
    values ('a8000000-0000-4000-8000-00000000000a', 'futur@test.local', '{manager}',
            'a8000000-0000-4000-8000-000000000201', 'jeton-manager', now() + interval '1 day')$$,
  'temoin: la meme invitation passe pour un gerant');

-- ===========================================================================
-- 2. Le poste owner ne se retire pas, la ligne ne se deplace pas
-- ===========================================================================
select throws_ok(
  $$update public.admin_users set postes = '{manager}' where id = 'a8000000-0000-4000-8000-000000000201'$$,
  '42501', 'the owner poste cannot be granted or removed', 'retrait: retirer owner au proprietaire est refuse');
select throws_ok(
  $$update public.admin_users set role = 'manager' where id = 'a8000000-0000-4000-8000-000000000201'$$,
  '42501', 'the owner poste cannot be granted or removed', 'retrait: role = manager sur le proprietaire (ancien code) est refuse');
select throws_ok(
  $$update public.admin_users set tenant_id = 'a8000000-0000-4000-8000-00000000000c' where id = 'a8000000-0000-4000-8000-000000000201'$$,
  '42501', 'the owner row cannot be reassigned', 'deplacement: changer le restaurant de la ligne du proprietaire est refuse');
select throws_ok(
  $$update public.admin_users set user_id = 'a8000000-0000-4000-8000-000000000103' where id = 'a8000000-0000-4000-8000-000000000201'$$,
  '42501', 'the owner row cannot be reassigned', 'deplacement: changer le compte de la ligne du proprietaire est refuse');
select lives_ok(
  $$update public.admin_users set full_name = 'Patron', is_active = false where id = 'a8000000-0000-4000-8000-000000000201'$$,
  'limite assumee: les autres colonnes du proprietaire restent modifiables (la plateforme peut le desactiver)');
update public.admin_users set is_active = true where id = 'a8000000-0000-4000-8000-000000000201';

-- ===========================================================================
-- 3. La ligne du proprietaire d'un restaurant vivant ne se supprime pas
-- ===========================================================================
select throws_ok(
  $$delete from public.admin_users where id = 'a8000000-0000-4000-8000-000000000201'$$,
  '42501', 'the owner of a live restaurant cannot be removed', 'suppression: DELETE du proprietaire refuse');
set local role service_role;
select throws_ok(
  $$delete from public.admin_users where id = 'a8000000-0000-4000-8000-000000000201'$$,
  '42501', 'the owner of a live restaurant cannot be removed', 'suppression: refuse aussi en service_role');

-- delete_admin_user_atomic sur un proprietaire ACCOMPAGNE : 42501, rien ne part.
select throws_ok(
  $$select public.delete_admin_user_atomic('a8000000-0000-4000-8000-000000000201', 'a8000000-0000-4000-8000-000000000101')$$,
  '42501', 'the owner of a live restaurant cannot be removed',
  'suppression: delete_admin_user_atomic sur un proprietaire accompagne est refuse');
reset role;

-- Suppression physique du compte auth.users : la cascade atteint la ligne.
select throws_ok(
  $$delete from auth.users where id = 'a8000000-0000-4000-8000-000000000101'$$,
  '42501', 'the owner of a live restaurant cannot be removed',
  'suppression: effacer le compte auth.users du proprietaire d un restaurant ouvert est refuse');
select is(
  (select count(*)::int from public.tenants where id = 'a8000000-0000-4000-8000-00000000000a')
  || '/' || (select count(*)::int from public.admin_users where tenant_id = 'a8000000-0000-4000-8000-00000000000a')
  || '/' || (select count(*)::int from auth.users where id = 'a8000000-0000-4000-8000-000000000101'),
  '1/4/1', 'suppression: apres les quatre tentatives, restaurant, 4 membres et compte sont intacts');

-- Temoin : les memes gestes passent sur un membre qui n'est pas proprietaire.
set local role service_role;
select is(public.delete_admin_user_atomic('a8000000-0000-4000-8000-000000000203', 'a8000000-0000-4000-8000-000000000103'),
  true, 'temoin: delete_admin_user_atomic retire un serveur et son compte');
reset role;
select lives_ok(
  $$delete from auth.users where id = 'a8000000-0000-4000-8000-000000000102'$$,
  'temoin: effacer le compte auth.users d un gerant passe (sa ligne part en cascade)');
select is((select count(*)::int from public.admin_users where tenant_id = 'a8000000-0000-4000-8000-00000000000a'), 2,
  'temoin: il reste le proprietaire et le cuisinier');

-- ===========================================================================
-- 4. Ce que la garde doit LAISSER PASSER
-- ===========================================================================
-- P1 : le dernier membre, proprietaire, supprime son restaurant.
set local role service_role;
select lives_ok(
  $$select public.delete_admin_user_atomic('a8000000-0000-4000-8000-000000000204', 'a8000000-0000-4000-8000-000000000104')$$,
  'cascade: delete_admin_user_atomic sur le seul membre proprietaire ne leve rien');
reset role;
select is(
  (select count(*)::int from public.tenants where id = 'a8000000-0000-4000-8000-00000000000b')
  || '/' || (select count(*)::int from public.admin_users where tenant_id = 'a8000000-0000-4000-8000-00000000000b')
  || '/' || (select count(*)::int from auth.users where id = 'a8000000-0000-4000-8000-000000000104'),
  '0/0/0', 'cascade: le restaurant, la ligne du proprietaire et son compte ont disparu');

-- Restaurant ferme (deleted_at) : la ligne du proprietaire se supprime.
select lives_ok(
  $$delete from public.admin_users where id = 'a8000000-0000-4000-8000-000000000205'$$,
  'restaurant ferme: DELETE du proprietaire passe');

-- Suppression directe d'un restaurant vivant (plateforme) : la cascade passe.
select lives_ok(
  $$delete from public.tenants where id = 'a8000000-0000-4000-8000-00000000000a'$$,
  'cascade: supprimer le restaurant emporte la ligne de son proprietaire');
select is((select count(*)::int from public.admin_users where tenant_id = 'a8000000-0000-4000-8000-00000000000a'), 0,
  'cascade: plus aucun membre pour ce restaurant');

select * from finish();
rollback;
