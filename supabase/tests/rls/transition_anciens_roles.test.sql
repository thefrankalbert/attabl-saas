-- Transition : tant que l'ancien code est en service, ses ecritures (`role`,
-- `custom_permissions`, `role_permissions`) sont traduites vers le nouveau
-- format, sans jamais ecraser ce que le nouveau code a pose.
--
-- POURQUOI CE TEST EXISTE. Les migrations du lot 1 des roles s'appliquent AVANT
-- le deploiement du code, et un onglet reste ouvert sur l'ancien deploiement
-- ecrit encore a l'ancienne apres. Trois declencheurs font le pont. S'ils se
-- trompent, les degats sont silencieux : un retrait de droit pose par le
-- proprietaire disparait, un reglage d'administrateur devient celui de tous
-- les gerants, ou un `admin` nait avec des droits de proprietaire.
--
-- CE QUI EST VERROUILLE.
--   A. Synchronisation role <-> postes sur admin_users.
--   B. Table de correspondance des 13 anciens codes (conception B.5), dont
--      "le refus gagne" et les deux abandons.
--   C. Invitations : une invitation `admin` acceptee donne un gerant.
--   D. Fusion sur les personnes : une cle posee par le nouveau code survit.
--   E. Report depuis role_permissions, sept cas, dont la preuve que le
--      declencheur est SECURITY INVOKER (cas 6 bis).
--
-- TEMOIN DU CHOIX INVOKER (E, cas 6 bis). Un proprietaire protege par un
-- facteur verifie, avec un jeton aal1, ecrit dans role_permissions. L'ancienne
-- politique le laisse passer (elle ne regarde pas la double authentification).
-- Le report, lui, passe par is_tenant_owner, qui la regarde : toute l'ecriture
-- echoue. Le test bascule ensuite la fonction en SECURITY DEFINER et rejoue la
-- MEME ecriture : elle passe. C'est donc bien le mode INVOKER qui la retient.
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(65);

-- Restaurant T : 1 proprietaire, 2 gerant, 3 a 8 membres crees par les cas.
-- Restaurant M : 9 proprietaire protege par un facteur verifie.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('aa000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'transition' || g || '@test.local', 'x', now(), now()
from generate_series(1, 9) g;
insert into public.tenants (id, slug, name, is_active) values
  ('aa000000-0000-4000-8000-00000000000a', 'transition-t', 'Transition T', true),
  ('aa000000-0000-4000-8000-00000000000b', 'transition-m', 'Transition M', true);
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active) values
  ('aa000000-0000-4000-8000-000000000201', 'aa000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000101', 'transition1@test.local', 'owner', true),
  ('aa000000-0000-4000-8000-000000000202', 'aa000000-0000-4000-8000-00000000000a', 'aa000000-0000-4000-8000-000000000102', 'transition2@test.local', 'manager', true),
  ('aa000000-0000-4000-8000-000000000209', 'aa000000-0000-4000-8000-00000000000b', 'aa000000-0000-4000-8000-000000000109', 'transition9@test.local', 'owner', true);
insert into auth.mfa_factors (id, user_id, factor_type, status)
values ('aa000000-0000-4000-8000-000000000301', 'aa000000-0000-4000-8000-000000000109', 'totp', 'verified');

-- ===========================================================================
-- A. Synchronisation role <-> postes
-- ===========================================================================
select is((select postes from public.admin_users where id = 'aa000000-0000-4000-8000-000000000201'),
  '{owner}'::text[], 'A: INSERT a l ancienne (role = owner) : postes deduits');

-- Ancien format complet : role + custom_permissions.
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, custom_permissions)
values ('aa000000-0000-4000-8000-000000000203', 'aa000000-0000-4000-8000-00000000000a',
        'aa000000-0000-4000-8000-000000000103', 'transition3@test.local', 'waiter', true,
        '{"pos.use": true, "orders.manage": false, "settings.view": true}');
select is((select postes from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  '{waiter}'::text[], 'A: INSERT role = waiter : postes = {waiter}');
select is((select permission_overrides from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  '{"orders.take": false, "kitchen.track": false, "orders.cancel": false, "orders.discount": false, "orders.refund": false}'::jsonb,
  'A: custom_permissions traduit a l INSERT (le refus gagne sur orders.take, settings.view abandonne)');

-- role = admin : gerant plus le paiement de l'abonnement, et `role` reste admin.
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values ('aa000000-0000-4000-8000-000000000204', 'aa000000-0000-4000-8000-00000000000a',
        'aa000000-0000-4000-8000-000000000104', 'transition4@test.local', 'admin', true);
select is((select postes::text || ' ' || role || ' ' || permission_overrides::text from public.admin_users
            where id = 'aa000000-0000-4000-8000-000000000204'),
  '{manager} admin {"billing.manage": true}',
  'A: INSERT role = admin : gerant + billing.manage, et role reste admin pour l ancien code');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000104"}';
select ok(public.has_tenant_write_permission('aa000000-0000-4000-8000-00000000000a', 'billing.manage')
      and public.has_tenant_write_permission('aa000000-0000-4000-8000-00000000000a', 'settings.edit'),
  'A: l ancien administrateur garde ce qu il avait (reglages, abonnement)');
select ok(not public.is_tenant_owner('aa000000-0000-4000-8000-00000000000a'),
  'A temoin: role = admin ne donne AUCUN droit reserve au proprietaire');
select throws_ok(
  $$insert into public.poste_permissions (tenant_id, poste, permissions)
    values ('aa000000-0000-4000-8000-00000000000a', 'waiter', '{"orders.pay": true}')$$,
  '42501', null, 'A temoin: l ancien administrateur ne regle pas les droits des postes');
reset role;

-- UPDATE de role seul (ancien code) : les postes suivent.
update public.admin_users set role = 'chef' where id = 'aa000000-0000-4000-8000-000000000203';
select is((select postes from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  '{chef}'::text[], 'A: UPDATE de role seul : postes suivent');
-- UPDATE de postes (nouveau code) : role projete.
update public.admin_users set postes = '{cook,cashier}' where id = 'aa000000-0000-4000-8000-000000000203';
select is((select role || ' ' || postes::text from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  'cashier {cashier,cook}', 'A: UPDATE de postes : role projete sur le premier poste canonique');
-- Les deux changent : postes gagne.
update public.admin_users set postes = '{waiter}', role = 'manager' where id = 'aa000000-0000-4000-8000-000000000203';
select is((select role || ' ' || postes::text from public.admin_users where id = 'aa000000-0000-4000-8000-000000000203'),
  'waiter {waiter}', 'A: postes et role changent ensemble : postes gagne');
-- L'ancien administrateur change de role : il perd le paiement de l'abonnement.
update public.admin_users set role = 'cashier' where id = 'aa000000-0000-4000-8000-000000000204';
select is((select postes::text || ' ' || coalesce(permission_overrides::text, 'null') from public.admin_users
            where id = 'aa000000-0000-4000-8000-000000000204'),
  '{cashier} null', 'A: un admin retrograde par l ancien code ne garde pas billing.manage');

-- Audits du 2026-11-28 (decision G.f). Le NOUVEL ecran change les postes de
-- l'ancien administrateur : `role` quitte `admin`, et la contraction (MIG4, qui
-- filtre sur `role = 'admin'`) ne le verrait plus. Le reglage part donc ici.
update public.admin_users set role = 'admin' where id = 'aa000000-0000-4000-8000-000000000204';
select is((select role || ' ' || permission_overrides::text from public.admin_users
            where id = 'aa000000-0000-4000-8000-000000000204'),
  'admin {"billing.manage": true}', 'A temoin: redevenu admin, il porte de nouveau billing.manage');
update public.admin_users set postes = '{manager,cashier}' where id = 'aa000000-0000-4000-8000-000000000204';
select is((select role || ' ' || postes::text || ' ' || coalesce(permission_overrides::text, 'null')
             from public.admin_users where id = 'aa000000-0000-4000-8000-000000000204'),
  'manager {manager,cashier} null',
  'A: postes changes par le nouvel ecran : l ancien admin devient gerant et PERD billing.manage');
-- Le proprietaire qui regle `permission_overrides` dans la MEME ecriture est obei.
update public.admin_users set role = 'admin' where id = 'aa000000-0000-4000-8000-000000000204';
update public.admin_users set postes = '{manager,cashier}', permission_overrides = '{"billing.manage": true, "menu.price": false}'
 where id = 'aa000000-0000-4000-8000-000000000204';
select is((select permission_overrides from public.admin_users where id = 'aa000000-0000-4000-8000-000000000204'),
  '{"billing.manage": true, "menu.price": false}'::jsonb,
  'A temoin: un reglage par personne ecrit dans la meme ecriture est respecte');
update public.admin_users set postes = '{cashier}', permission_overrides = null
 where id = 'aa000000-0000-4000-8000-000000000204';

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
-- B. Correspondance des 13 anciens codes
-- ===========================================================================
select is(private.droits_depuis_anciens('{"menu.view": true}'), '{"menu.view": true}'::jsonb, 'B: menu.view');
select is(private.droits_depuis_anciens('{"menu.edit": false}'), '{"menu.edit": false, "menu.price": false}'::jsonb,
  'B: menu.edit contenait les prix : menu.edit et menu.price');
select is(private.droits_depuis_anciens('{"orders.view": false}'), '{}'::jsonb, 'B: orders.view abandonne');
select is(private.droits_depuis_anciens('{"orders.manage": true}'), '{"orders.take": true, "kitchen.track": true}'::jsonb,
  'B: orders.manage a vrai : prendre et suivre, rien sur annuler, remiser, rembourser');
select is(private.droits_depuis_anciens('{"orders.manage": false}'),
  '{"orders.take": false, "kitchen.track": false, "orders.cancel": false, "orders.discount": false, "orders.refund": false}'::jsonb,
  'B: orders.manage a faux : retire aussi annuler, remiser, rembourser');
select is(private.droits_depuis_anciens('{"orders.pay": true}'), '{"orders.pay": true}'::jsonb, 'B: orders.pay a vrai');
select is(private.droits_depuis_anciens('{"orders.pay": false}'),
  '{"orders.pay": false, "orders.discount": false, "orders.refund": false}'::jsonb,
  'B: orders.pay a faux : retire aussi remiser et rembourser');
select is(private.droits_depuis_anciens('{"reports.view": true}'), '{"reports.money": true, "reports.menu": true}'::jsonb,
  'B: reports.view : rapports d argent et de carte');
select is(private.droits_depuis_anciens('{"pos.use": false}'), '{"orders.take": false}'::jsonb, 'B: pos.use');
select is(private.droits_depuis_anciens('{"inventory.view": true, "inventory.edit": false}'),
  '{"inventory.view": true, "inventory.edit": false, "suppliers.manage": false}'::jsonb,
  'B: inventory.edit contenait les fournisseurs');
select is(private.droits_depuis_anciens('{"team.view": true, "team.manage": false, "settings.edit": true, "settings.view": false}'),
  '{"team.view": true, "team.manage": false, "settings.edit": true}'::jsonb,
  'B: team.view, team.manage, settings.edit inchanges ; settings.view abandonne');
select is(private.droits_depuis_anciens('{"pos.use": true, "orders.manage": false}') -> 'orders.take', 'false'::jsonb,
  'B: deux anciennes cles vers le meme droit : le refus gagne');
select is(private.droits_depuis_anciens('{"pos.use": true, "orders.manage": true}') -> 'orders.take', 'true'::jsonb,
  'B temoin: sans refus, le droit est accorde');
select is(private.droits_depuis_anciens('{"menu.edit": "oui", "nimporte": true}'), '{}'::jsonb,
  'B: valeur non booleenne et cle inconnue ignorees');
select is(private.droits_depuis_anciens(null) is null and private.droits_depuis_anciens('["menu.edit"]') is null, true,
  'B: NULL et tableau JSON rendent NULL');
select ok((select bool_and(private.droits_valides(private.droits_depuis_anciens(x.j)))
            from (values ('{"menu.edit": true, "orders.manage": false, "orders.pay": false, "reports.view": true,
                            "pos.use": true, "inventory.edit": true, "team.manage": true, "settings.edit": false}'::jsonb)) x(j)),
  'B: toute traduction ne produit que des codes du catalogue');

-- ===========================================================================
-- C. Invitations
-- ===========================================================================
insert into public.invitations (id, tenant_id, email, role, invited_by, token, expires_at)
values ('aa000000-0000-4000-8000-000000000401', 'aa000000-0000-4000-8000-00000000000a', 'transition5@test.local',
        'admin', 'aa000000-0000-4000-8000-000000000201', 'jeton-admin', now() + interval '1 day');
select is((select postes::text || ' ' || permission_overrides::text from public.invitations
            where id = 'aa000000-0000-4000-8000-000000000401'),
  '{manager} {"billing.manage": true}', 'C: une invitation admin (ancien code) porte gerant + billing.manage');
select lives_ok(
  $$select public.accept_invitation_membership('aa000000-0000-4000-8000-000000000401',
      'aa000000-0000-4000-8000-000000000105', 'Invite Admin')$$,
  'C: l invitation admin s accepte sans erreur');
select is((select role || ' ' || postes::text || ' ' || coalesce(permission_overrides::text, 'null')
             from public.admin_users where user_id = 'aa000000-0000-4000-8000-000000000105'),
  'manager {manager} null',
  'C: le membre nait gerant (role manager), JAMAIS admin, et SANS le billing.manage de l invitation admin');

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
-- D. Fusion sur les personnes : le nouveau code n'est jamais ecrase
-- ===========================================================================
insert into public.admin_users (id, tenant_id, user_id, email, postes, permission_overrides, is_active)
values ('aa000000-0000-4000-8000-000000000207', 'aa000000-0000-4000-8000-00000000000a',
        'aa000000-0000-4000-8000-000000000107', 'transition7@test.local', '{chef}', '{"menu.price": false}', true);
-- Un onglet reste sur l'ancien deploiement enregistre un reglage a l'ancienne.
update public.admin_users set custom_permissions = '{"menu.edit": true}'
 where id = 'aa000000-0000-4000-8000-000000000207';
select is((select permission_overrides from public.admin_users where id = 'aa000000-0000-4000-8000-000000000207'),
  '{"menu.price": false, "menu.edit": true}'::jsonb,
  'D: le retrait de menu.price pose par le nouveau code TIENT apres une ecriture de l ancien');
-- L'ancien code retire sa cle : seule SA cle part.
update public.admin_users set custom_permissions = null where id = 'aa000000-0000-4000-8000-000000000207';
select is((select permission_overrides from public.admin_users where id = 'aa000000-0000-4000-8000-000000000207'),
  '{"menu.price": false}'::jsonb, 'D: l ancien code ne retire que la cle qu il avait posee');
-- Temoin : sans reglage du nouveau code, l'ancienne ecriture pose bien les deux cles.
insert into public.admin_users (id, tenant_id, user_id, email, postes, is_active)
values ('aa000000-0000-4000-8000-000000000208', 'aa000000-0000-4000-8000-00000000000a',
        'aa000000-0000-4000-8000-000000000108', 'transition8@test.local', '{chef}', true);
update public.admin_users set custom_permissions = '{"menu.edit": false}'
 where id = 'aa000000-0000-4000-8000-000000000208';
select is((select permission_overrides from public.admin_users where id = 'aa000000-0000-4000-8000-000000000208'),
  '{"menu.edit": false, "menu.price": false}'::jsonb,
  'D temoin: sans cle du nouveau code, l ancienne ecriture est traduite en entier');
-- Le billing.manage de l'ancien administrateur survit a une ancienne ecriture.
update public.admin_users set role = 'admin' where id = 'aa000000-0000-4000-8000-000000000204';
update public.admin_users set custom_permissions = '{"menu.edit": false}'
 where id = 'aa000000-0000-4000-8000-000000000204';
select is((select permission_overrides from public.admin_users where id = 'aa000000-0000-4000-8000-000000000204'),
  '{"billing.manage": true, "menu.edit": false, "menu.price": false}'::jsonb,
  'D: billing.manage de l ancien administrateur survit a une ecriture de l ancien code');
-- Si le nouveau code ecrit permission_overrides dans le MEME UPDATE, il gagne.
update public.admin_users set custom_permissions = '{"menu.edit": true}', permission_overrides = '{"cash.close": true}'
 where id = 'aa000000-0000-4000-8000-000000000208';
select is((select permission_overrides from public.admin_users where id = 'aa000000-0000-4000-8000-000000000208'),
  '{"cash.close": true}'::jsonb, 'D: une ecriture explicite de permission_overrides n est pas refondue');

-- ===========================================================================
-- E. Report depuis role_permissions
-- ===========================================================================
select is((select p.prosecdef from pg_proc p where p.oid = 'public.role_permissions_vers_postes()'::regprocedure),
  false, 'E: role_permissions_vers_postes est SECURITY INVOKER');
select is(has_function_privilege('authenticated', 'public.role_permissions_vers_postes()', 'EXECUTE'), false,
  'E: authenticated n a pas EXECUTE sur la fonction du declencheur');

-- Cas 1 : INSERT chef SOUS LE JETON DU PROPRIETAIRE. Constate deux choses : il
-- execute le corps du declencheur alors que la fonction lui est retiree, et
-- l'ecriture reportee passe les politiques de poste_permissions.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000101"}';
select lives_ok(
  $$insert into public.role_permissions (tenant_id, role, permissions)
    values ('aa000000-0000-4000-8000-00000000000a', 'chef', '{"inventory.edit": false}')$$,
  'E cas 1: le proprietaire ecrit role_permissions avec son jeton');
select is((select permissions from public.poste_permissions
            where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and poste = 'chef'),
  '{"inventory.edit": false, "suppliers.manage": false}'::jsonb,
  'E cas 1: le reglage est reporte, traduit, dans poste_permissions');

-- Reglage du poste Gerant pose par le NOUVEAU code.
insert into public.poste_permissions (tenant_id, poste, permissions)
values ('aa000000-0000-4000-8000-00000000000a', 'manager', '{"cash.close": false}');

-- Cas 2 : INSERT admin, jamais reporte.
select lives_ok(
  $$insert into public.role_permissions (tenant_id, role, permissions)
    values ('aa000000-0000-4000-8000-00000000000a', 'admin', '{"menu.edit": false, "settings.edit": false}')$$,
  'E cas 2: le proprietaire ecrit le reglage du role admin');
select is((select permissions from public.poste_permissions
            where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and poste = 'manager'),
  '{"cash.close": false}'::jsonb, 'E cas 2: le reglage admin ne devient PAS celui du poste Gerant');

-- Cas 3 : DELETE de la ligne admin.
delete from public.role_permissions
 where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and role = 'admin';
select is((select permissions from public.poste_permissions
            where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and poste = 'manager'),
  '{"cash.close": false}'::jsonb, 'E cas 3: supprimer la ligne admin ne touche pas le poste Gerant');

-- Cas 4 : le nouveau code retire menu.price au chef, puis l'ancien ecrit menu.edit.
update public.poste_permissions set permissions = permissions || '{"menu.price": false}'
 where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and poste = 'chef';
update public.role_permissions set permissions = '{"inventory.edit": false, "menu.edit": true}'
 where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and role = 'chef';
select is((select permissions from public.poste_permissions
            where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and poste = 'chef'),
  '{"inventory.edit": false, "suppliers.manage": false, "menu.price": false, "menu.edit": true}'::jsonb,
  'E cas 4: menu.price pose par le nouveau code reste false, menu.edit est ajoute');

-- Cas 5 : DELETE de l'ancienne ligne chef.
delete from public.role_permissions
 where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and role = 'chef';
select is((select permissions from public.poste_permissions
            where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and poste = 'chef'),
  '{"menu.price": false}'::jsonb,
  'E cas 5: seules les cles posees par l ancien code partent, la ligne et menu.price restent');

-- Cas 6 : un gerant ecrit role_permissions avec son jeton. Arrete par
-- l'ANCIENNE politique : ce cas ne prouve pas le choix INVOKER (voir 6 bis).
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000102"}';
select throws_ok(
  $$insert into public.role_permissions (tenant_id, role, permissions)
    values ('aa000000-0000-4000-8000-00000000000a', 'waiter', '{"orders.pay": true}')$$,
  '42501', null, 'E cas 6: un gerant n ecrit pas role_permissions');
reset role;
select is((select count(*)::int from public.poste_permissions
            where tenant_id = 'aa000000-0000-4000-8000-00000000000a' and poste = 'waiter'), 0,
  'E cas 6: rien dans poste_permissions');

-- Cas 6 bis : LA preuve du choix INVOKER.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000109","aal":"aal1"}';
select throws_ok(
  $$insert into public.role_permissions (tenant_id, role, permissions)
    values ('aa000000-0000-4000-8000-00000000000b', 'waiter', '{"orders.pay": true}')$$,
  '42501', null,
  'E cas 6 bis: proprietaire protege, jeton aal1 : toute l ecriture echoue (le report passe par is_tenant_owner)');
reset role;
select is((select count(*)::int from public.role_permissions where tenant_id = 'aa000000-0000-4000-8000-00000000000b')
       || '/' || (select count(*)::int from public.poste_permissions where tenant_id = 'aa000000-0000-4000-8000-00000000000b'),
  '0/0', 'E cas 6 bis: 0 ligne dans les deux tables');

-- Temoin : la meme ecriture, fonction basculee en SECURITY DEFINER, PASSE. Le
-- refus ci-dessus vient donc du mode INVOKER, pas de l'ancienne politique.
alter function public.role_permissions_vers_postes() security definer;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000109","aal":"aal1"}';
select lives_ok(
  $$insert into public.role_permissions (tenant_id, role, permissions)
    values ('aa000000-0000-4000-8000-00000000000b', 'waiter', '{"orders.pay": true}')$$,
  'E temoin: en SECURITY DEFINER la meme ecriture en aal1 passerait (c est ce que INVOKER empeche)');
reset role;
select is((select count(*)::int from public.poste_permissions where tenant_id = 'aa000000-0000-4000-8000-00000000000b'),
  1, 'E temoin: et elle atteindrait poste_permissions sans passer par sa garde');
alter function public.role_permissions_vers_postes() security invoker;
delete from public.role_permissions where tenant_id = 'aa000000-0000-4000-8000-00000000000b';
delete from public.poste_permissions where tenant_id = 'aa000000-0000-4000-8000-00000000000b';

-- Et le meme proprietaire, une fois son code saisi (aal2), ecrit normalement.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-0000-4000-8000-000000000109","aal":"aal2"}';
select lives_ok(
  $$insert into public.role_permissions (tenant_id, role, permissions)
    values ('aa000000-0000-4000-8000-00000000000b', 'waiter', '{"orders.pay": true}')$$,
  'E temoin: le meme proprietaire en aal2 ecrit, en mode INVOKER');
select is((select permissions from public.poste_permissions
            where tenant_id = 'aa000000-0000-4000-8000-00000000000b' and poste = 'waiter'),
  '{"orders.pay": true}'::jsonb, 'E temoin: et le report est fait');
reset role;

select * from finish();
rollback;
