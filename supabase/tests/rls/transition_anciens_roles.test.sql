-- Transition : la colonne `role` et la colonne `postes` vivent encore cote a
-- cote (la colonne `role` part avec MIG5). Deux declencheurs les gardent
-- d'accord. Les anciens reglages, eux, sont partis avec la contraction (MIG4,
-- 20261128120000) : `custom_permissions`, `role_permissions` et leurs
-- fonctions de traduction n'existent plus.
--
-- POURQUOI CE TEST EXISTE. Tant que `role` existe, une ecriture qui ne pose
-- que `role` (script, seed, ancienne habitude) doit donner les bons postes, et
-- l'inverse. Si la synchronisation se trompe, les degats sont silencieux : un
-- `admin` nait avec des droits de proprietaire, ou un membre garde un role qui
-- ne correspond plus a ses postes.
--
-- CE QUI EST VERROUILLE.
--   A. Synchronisation role <-> postes sur admin_users. Decision G.f : l'ancien
--      administrateur est un gerant SIMPLE, sans le paiement de l'abonnement,
--      et les declencheurs ne touchent plus au reglage par personne.
--   C. Invitations : une invitation `admin` acceptee donne un gerant simple.
--   F. Contraction : les anciens objets sont partis, et plus aucune fonction
--      ne les cite.
-- (Les sections B, D et E prouvaient la traduction des anciens reglages
-- pendant que l'ancien code etait servi. Elles sont parties avec lui.)
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

-- Restaurant T : 1 proprietaire, 2 gerant, 3 a 6 membres crees par les cas.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('aa000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'transition' || g || '@test.local', 'x', now(), now()
from generate_series(1, 6) g;
insert into public.tenants (id, slug, name, is_active) values
  ('aa000000-0000-4000-8000-00000000000a', 'transition-t', 'Transition T', true);
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active) values
  ('aa000000-0000-4000-8000-000000000201', 'aa000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000101', 'transition1@test.local', 'owner', true),
  ('aa000000-0000-4000-8000-000000000202', 'aa000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000102', 'transition2@test.local', 'manager', true);

-- ===========================================================================
-- A. Synchronisation role <-> postes
-- ===========================================================================
select is((select postes from public.admin_users where id = 'aa000000-0000-4000-8000-000000000201'),
  '{owner}'::text[], 'A: INSERT par le role seul (role = owner) : postes deduits');

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values ('aa000000-0000-4000-8000-000000000203', 'aa000000-0000-4000-8000-00000000000a',
        'aa000000-0000-4000-8000-000000000103', 'transition3@test.local', 'waiter', true);
select is((select postes from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  '{waiter}'::text[], 'A: INSERT role = waiter : postes = {waiter}');

-- role = admin : un gerant SIMPLE (decision G.f), et `role` reste admin.
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values ('aa000000-0000-4000-8000-000000000204', 'aa000000-0000-4000-8000-00000000000a',
        'aa000000-0000-4000-8000-000000000104', 'transition4@test.local', 'admin', true);
select is((select postes::text || ' ' || role || ' ' || coalesce(permission_overrides::text, 'null')
             from public.admin_users where id = 'aa000000-0000-4000-8000-000000000204'),
  '{manager} admin null',
  'A: INSERT role = admin : gerant, SANS billing.manage (le declencheur ne le pose plus)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000104"}';
select ok(public.has_tenant_write_permission('aa000000-0000-4000-8000-00000000000a', 'settings.edit')
      and not public.has_tenant_write_permission('aa000000-0000-4000-8000-00000000000a', 'billing.manage'),
  'A: l ancien administrateur regle le restaurant comme un gerant, et ne paie plus l abonnement');
select ok(not public.is_tenant_owner('aa000000-0000-4000-8000-00000000000a'),
  'A temoin: role = admin ne donne AUCUN droit reserve au proprietaire');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('aa000000-0000-4000-8000-00000000000a', 'waiter', '{"orders.pay": true}')$$,
  '42501', null, 'A temoin: l ancien administrateur ne regle pas les droits des postes');
reset role;

-- UPDATE de role seul : les postes suivent.
update public.admin_users set role = 'chef' where id = 'aa000000-0000-4000-8000-000000000203';
select is((select postes from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  '{chef}'::text[], 'A: UPDATE de role seul : postes suivent');
-- UPDATE de postes : role projete.
update public.admin_users set postes = '{cook,cashier}' where id = 'aa000000-0000-4000-8000-000000000203';
select is((select role || ' ' || postes::text from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  'cashier {cashier,cook}', 'A: UPDATE de postes : role projete sur le premier poste canonique');
-- Les deux changent : postes gagne.
update public.admin_users set postes = '{waiter}', role = 'manager' where id = 'aa000000-0000-4000-8000-000000000203';
select is((select role || ' ' || postes::text from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  'waiter {waiter}', 'A: postes et role changent ensemble : postes gagne');
update public.admin_users set role = 'cashier' where id = 'aa000000-0000-4000-8000-000000000204';
select is((select postes::text || ' ' || coalesce(permission_overrides::text, 'null') from public.admin_users
            where id = 'aa000000-0000-4000-8000-000000000204'),
  '{cashier} null', 'A: un admin qui change de role suit ses nouveaux postes, sans reglage ajoute');

-- Le reglage par personne appartient au proprietaire : les declencheurs n'y
-- touchent plus, ni pour poser billing.manage ni pour le retirer.
update public.admin_users set postes = '{manager,cashier}', permission_overrides = '{"billing.manage": true, "menu.price": false}'
 where id = 'aa000000-0000-4000-8000-000000000204';
select is((select permission_overrides from public.admin_users where id = 'aa000000-0000-4000-8000-000000000204'),
  '{"billing.manage": true, "menu.price": false}'::jsonb,
  'A: un reglage par personne pose par le proprietaire est enregistre tel quel');
update public.admin_users set role = 'admin' where id = 'aa000000-0000-4000-8000-000000000204';
update public.admin_users set postes = '{cashier}' where id = 'aa000000-0000-4000-8000-000000000204';
select is((select role || ' ' || permission_overrides::text from public.admin_users
            where id = 'aa000000-0000-4000-8000-000000000204'),
  'cashier {"menu.price": false, "billing.manage": true}',
  'A: changer de role puis de postes ne touche plus au reglage par personne');

-- Plus de role par defaut : un INSERT sans role ni postes est refuse.
select throws_ok(
  $$insert into public.admin_users (tenant_id, user_id, email, is_active)
    values ('aa000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000105', 'transition5@test.local', true)$$,
  '23502', null, 'A: INSERT sans role ni postes refuse (l ancien DEFAULT creait un administrateur complet)');
select is((select column_default from information_schema.columns
            where table_schema = 'public' and table_name = 'admin_users' and column_name = 'role'), null,
  'A: la colonne role n a plus de valeur par defaut');
select throws_ok(
  $$insert into public.admin_users (tenant_id, user_id, email, role, is_active)
    values ('aa000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000105', 'transition5@test.local', 'patron', true)$$,
  '23514', null, 'A: un role inconnu est refuse');
select throws_ok(
  $$insert into public.admin_users (tenant_id, user_id, email, postes, is_active)
    values ('aa000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000105', 'transition5@test.local', '{waiter,patron}', true)$$,
  '23514', null, 'A: un poste inconnu est refuse, il ne disparait pas en silence a la normalisation');
select throws_ok(
  $$update public.admin_users set permission_overrides = '{"orders.manage": true}'
     where id = 'aa000000-0000-4000-8000-000000000203'$$,
  '23514', null, 'A: un reglage par personne ecrit avec un ancien code est refuse');

-- ===========================================================================
-- C. Invitations
-- ===========================================================================
insert into public.invitations (id, tenant_id, email, role, invited_by, token, expires_at)
values ('aa000000-0000-4000-8000-000000000401', 'aa000000-0000-4000-8000-00000000000a', 'transition5@test.local',
        'admin', 'aa000000-0000-4000-8000-000000000201', 'jeton-admin', now() + interval '1 day');
select is((select postes::text || ' ' || coalesce(permission_overrides::text, 'null') from public.invitations
            where id = 'aa000000-0000-4000-8000-000000000401'),
  '{manager} null', 'C: une invitation admin porte gerant, SANS billing.manage');
select lives_ok(
  $$select public.accept_invitation_membership('aa000000-0000-4000-8000-000000000401',
      'aa000000-0000-4000-8000-000000000105', 'Invite Admin')$$,
  'C: l invitation admin s accepte sans erreur');
select is((select role || ' ' || postes::text || ' ' || coalesce(permission_overrides::text, 'null')
             from public.admin_users where user_id = 'aa000000-0000-4000-8000-000000000105'),
  'manager {manager} null',
  'C: le membre nait gerant simple (role manager), JAMAIS admin, et sans paiement de l abonnement');

-- Nouveau format : deux postes et un reglage, recopies a l'acceptation.
insert into public.invitations (id, tenant_id, email, postes, permission_overrides, invited_by, token, expires_at)
values ('aa000000-0000-4000-8000-000000000402', 'aa000000-0000-4000-8000-00000000000a', 'transition6@test.local',
        '{waiter,cashier}', '{"cash.count": false}', 'aa000000-0000-4000-8000-000000000201', 'jeton-cumul',
        now() + interval '1 day');
select is((select role from public.invitations where id = 'aa000000-0000-4000-8000-000000000402'), 'cashier',
  'C: invitation au nouveau format : role projete');
select lives_ok(
  $$select public.accept_invitation_membership('aa000000-0000-4000-8000-000000000402',
      'aa000000-0000-4000-8000-000000000106', 'Invite Cumul')$$,
  'C: l invitation a deux postes s accepte');
select is((select postes::text || ' ' || permission_overrides::text from public.admin_users
            where user_id = 'aa000000-0000-4000-8000-000000000106'),
  '{cashier,waiter} {"cash.count": false}', 'C: postes et reglage par personne recopies de l invitation');
-- Temoin : un billing.manage pose par le proprietaire sur une invitation au
-- NOUVEAU format (role projete = manager, pas admin) est bien recopie.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('aa000000-0000-4000-8000-00000000011a', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'transition-facture@test.local', 'x', now(), now());
insert into public.invitations (id, tenant_id, email, postes, permission_overrides, invited_by, token, expires_at)
values ('aa000000-0000-4000-8000-000000000403', 'aa000000-0000-4000-8000-00000000000a', 'transition-facture@test.local',
        '{manager}', '{"billing.manage": true}', 'aa000000-0000-4000-8000-000000000201', 'jeton-facture',
        now() + interval '1 day');
select public.accept_invitation_membership('aa000000-0000-4000-8000-000000000403',
  'aa000000-0000-4000-8000-00000000011a', 'Invite Facture');
select is((select permission_overrides from public.admin_users
            where user_id = 'aa000000-0000-4000-8000-00000000011a'),
  '{"billing.manage": true}'::jsonb,
  'C temoin: le billing.manage voulu par le proprietaire (invitation au nouveau format) est recopie');
select throws_ok(
  $$insert into public.invitations (tenant_id, email, invited_by, token, expires_at)
    values ('aa000000-0000-4000-8000-00000000000a', 'vide@test.local',
            'aa000000-0000-4000-8000-000000000201', 'jeton-vide', now() + interval '1 day')$$,
  '23502', null, 'C: une invitation sans role ni postes est refusee');

-- ===========================================================================
-- F. Contraction : les anciens objets sont partis
-- ===========================================================================
select has_column('public', 'admin_users', 'permission_overrides',
  'F temoin: la verification voit bien les colonnes de admin_users');
select hasnt_column('public', 'admin_users', 'custom_permissions', 'F: admin_users.custom_permissions est supprimee');
select hasnt_column('public', 'invitations', 'custom_permissions', 'F: invitations.custom_permissions est supprimee');
select hasnt_table('public', 'role_permissions', 'F: la table role_permissions est supprimee');
select is((select count(*)::int from (values
             ('public.role_permissions_vers_postes()'),
             ('private.fusion_anciens_droits(jsonb, jsonb, jsonb)'),
             ('private.droits_depuis_anciens(jsonb)')) v(signature)
            where to_regprocedure(v.signature) is not null), 0,
  'F: les trois fonctions de traduction sont supprimees');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private')
              and p.prosrc ~ '(custom_permissions|role_permissions|fusion_anciens_droits|droits_depuis_anciens)'), 0,
  'F: plus aucune fonction ne cite un objet supprime');

select * from finish();
rollback;
