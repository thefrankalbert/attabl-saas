-- Un employe ne peut pas s'elever lui-meme : ni ses postes, ni son reglage par
-- personne, ni son role, sur SA PROPRE ligne.
--
-- POURQUOI CE TEST EXISTE. C'est l'argument central du modele de donnees
-- (conception A.1) : les postes vivent dans une colonne de `admin_users`, pas
-- dans une table a part, parce que `authenticated` n'a UPDATE que sur cinq
-- colonnes de cette table (full_name, last_login, phone, last_login_at,
-- login_count). Or la politique "Members update their own admin row" autorise
-- chacun a modifier SA ligne : si un jour quelqu'un accorde UPDATE sur la
-- table entiere, ou sur `postes`, n'importe quel serveur devient proprietaire
-- par un appel a l'API. Ce test tombe ce jour-la.
--
-- TEMOIN. Sur la meme ligne, sous le meme jeton, `update ... set full_name`
-- PASSE : le refus vient bien de la colonne, pas d'un blocage general.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('ad000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'eleve' || g || '@test.local', 'x', now(), now()
from generate_series(1, 2) g;
insert into public.tenants (id, slug, name, is_active)
values ('ad000000-0000-4000-8000-000000000001', 'tenant-eleve', 'Tenant Eleve', true);
insert into public.admin_users (id, tenant_id, user_id, email, postes, is_active) values
  ('ad000000-0000-4000-8000-000000000201', 'ad000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000101', 'eleve1@test.local', '{owner}', true),
  ('ad000000-0000-4000-8000-000000000202', 'ad000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000102', 'eleve2@test.local', '{waiter}', true);
insert into public.invitations (id, tenant_id, email, postes, invited_by, token, expires_at)
values ('ad000000-0000-4000-8000-000000000301', 'ad000000-0000-4000-8000-000000000001', 'eleve2@test.local', '{waiter}',
        'ad000000-0000-4000-8000-000000000201', 'jeton-eleve', now() + interval '1 day');

set local role authenticated;
set local request.jwt.claims = '{"sub":"ad000000-0000-4000-8000-000000000102"}';

-- Temoin d'abord : la ligne est bien la sienne et il peut l'ecrire.
select lives_ok(
  $$update public.admin_users set full_name = 'Serveur Renomme' where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  'temoin: le serveur modifie full_name sur sa propre ligne');
select is((select full_name from public.admin_users where user_id = 'ad000000-0000-4000-8000-000000000102'),
  'Serveur Renomme', 'temoin: la modification est bien ecrite (1 ligne touchee)');

select throws_ok(
  $$update public.admin_users set postes = '{owner}' where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'elevation: postes = {owner} sur sa ligne est refuse');
select throws_ok(
  $$update public.admin_users set postes = '{manager}' where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'elevation: postes = {manager} sur sa ligne est refuse');
select throws_ok(
  $$update public.admin_users set postes = postes || '{cashier}'::text[] where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'elevation: s ajouter un poste (cumul) est refuse');
select throws_ok(
  $$update public.admin_users set permission_overrides = '{"orders.pay": true}' where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'elevation: se donner orders.pay par permission_overrides est refuse');
select throws_ok(
  $$update public.admin_users set role = 'manager' where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'elevation: role = manager (ancienne colonne) est refuse');
select throws_ok(
  $$update public.admin_users set custom_permissions = '{"orders.pay": true}' where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'elevation: custom_permissions (ancienne colonne, traduite par declencheur) est refuse');
select throws_ok(
  $$update public.admin_users set full_name = 'x', postes = '{owner}' where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'elevation: melanger une colonne permise et postes est refuse en entier');
select throws_ok(
  $$update public.admin_users set is_active = true, deleted_at = null where user_id = 'ad000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'elevation: is_active et deleted_at ne sont pas a lui non plus');

-- Ni creer ni supprimer une ligne de membre.
select throws_ok(
  $$insert into public.admin_users (tenant_id, user_id, email, postes, is_active)
    values ('ad000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000102', 'eleve-bis@test.local', '{owner}', true)$$,
  '42501', null, 'elevation: INSERT dans admin_users refuse (aucun grant)');
select throws_ok(
  $$delete from public.admin_users where user_id = 'ad000000-0000-4000-8000-000000000101'$$,
  '42501', null, 'elevation: DELETE dans admin_users refuse (aucun grant) : il ne retire pas le proprietaire');

-- Les invitations : ni ecriture, ni lecture des colonnes de droits.
select throws_ok(
  $$update public.invitations set postes = '{manager}' where id = 'ad000000-0000-4000-8000-000000000301'$$,
  '42501', null, 'elevation: il ne reecrit pas les postes de sa propre invitation');
select throws_ok(
  $$select postes from public.invitations$$,
  '42501', null, 'invitations: la colonne postes n est pas lisible par un client de session');

reset role;
select is((select postes::text || ' ' || role || ' ' || coalesce(permission_overrides::text, 'null')
                  || ' ' || coalesce(custom_permissions::text, 'null')
            from public.admin_users where user_id = 'ad000000-0000-4000-8000-000000000102'),
  '{waiter} waiter null null', 'elevation: apres toutes les tentatives, sa ligne est inchangee');
select is((select count(*)::int from public.admin_users where tenant_id = 'ad000000-0000-4000-8000-000000000001'), 2,
  'elevation: toujours deux membres, proprietaire compris');

select * from finish();
rollback;
