-- Les gardes qui portaient une LISTE DE ROLES en dur lisent desormais un droit.
--
-- POURQUOI CE TEST EXISTE. Cinq gardes comparaient `role` a une liste ecrite
-- dans le SQL (`owner, admin, manager`, ou `owner, admin`) : lecture du journal
-- d'audit, des paiements de l'abonnement, des invitations, autorite d'argent,
-- plan de salle. Une liste de roles ignore le cumul et les reglages du
-- proprietaire : un gerant a qui l'on retirait le journal le lisait quand
-- meme. Le lot 1 des roles les branche sur le catalogue.
--
--   audit_log            : audit.view
--   flutterwave_payments : billing.manage, meme limite (le gerant voit les factures)
--   invitations          : team.manage
--   argent               : orders.pay ET orders.refund ET orders.cancel ET orders.discount
--   plan de salle        : settings.edit
--
-- TEMOINS. Pour chaque garde, un membre qui passe et un qui ne passe pas, sur
-- la meme requete. Pour l'argent : donner UN seul des quatre droits n'ouvre
-- rien, donner les quatre ouvre (la garde n'est pas simplement fermee).
--
-- Execution: scripts/run-pgtap.sh, ou psql "$LOCAL_DB" -f ce fichier.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

-- 1 proprietaire, 2 gerant, 3 gerant sans audit.view, 4 caissier, 5 chef,
-- 6 serveur, 7 caissier avec orders.refund seul, 8 caissier avec les quatre
-- droits d'argent, 9 serveur + caissier.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('ab000000-0000-4000-8000-00000000010' || g)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'liste' || g || '@test.local', 'x', now(), now()
from generate_series(1, 9) g;
insert into public.tenants (id, slug, name, is_active, subscription_plan, subscription_status)
values ('ab000000-0000-4000-8000-000000000001', 'tenant-listes', 'Tenant Listes', true, 'business', 'active');
insert into public.admin_users (id, tenant_id, user_id, email, postes, permission_overrides, is_active) values
  ('ab000000-0000-4000-8000-000000000201', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000101', 'liste1@test.local', '{owner}', null, true),
  ('ab000000-0000-4000-8000-000000000202', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000102', 'liste2@test.local', '{manager}', null, true),
  ('ab000000-0000-4000-8000-000000000203', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000103', 'liste3@test.local', '{manager}', '{"audit.view": false}', true),
  ('ab000000-0000-4000-8000-000000000204', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000104', 'liste4@test.local', '{cashier}', null, true),
  ('ab000000-0000-4000-8000-000000000205', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000105', 'liste5@test.local', '{chef}', null, true),
  ('ab000000-0000-4000-8000-000000000206', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000106', 'liste6@test.local', '{waiter}', null, true),
  ('ab000000-0000-4000-8000-000000000207', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000107', 'liste7@test.local', '{cashier}', '{"orders.refund": true}', true),
  ('ab000000-0000-4000-8000-000000000208', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000108', 'liste8@test.local', '{cashier}',
   '{"orders.refund": true, "orders.cancel": true, "orders.discount": true}', true),
  ('ab000000-0000-4000-8000-000000000209', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000109', 'liste9@test.local', '{waiter,cashier}', null, true);

insert into public.audit_log (tenant_id, action, entity_type)
values ('ab000000-0000-4000-8000-000000000001', 'create', 'menu_item');
insert into public.flutterwave_payments (tenant_id, tx_ref, plan, billing_interval, amount, currency)
values ('ab000000-0000-4000-8000-000000000001', 'liste-tx', 'pro', 'monthly', 10000, 'XOF');
insert into public.invitations (tenant_id, email, postes, invited_by, token, expires_at)
values ('ab000000-0000-4000-8000-000000000001', 'invite-liste@test.local', '{waiter}',
        'ab000000-0000-4000-8000-000000000201', 'jeton-liste', now() + interval '1 day');

set local role authenticated;

-- ===========================================================================
-- Journal d'audit : audit.view
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000102"}';
select is((select count(*)::int from public.audit_log), 1, 'audit: un gerant lit le journal');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000104"}';
select is((select count(*)::int from public.audit_log), 0, 'audit: un caissier ne lit PAS le journal');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000103"}';
select is((select count(*)::int from public.audit_log), 0,
  'audit: un gerant a qui le proprietaire retire audit.view ne lit PLUS le journal (l ancienne liste de roles le laissait lire)');

-- L'auteur d'une ligne d'audit porte ses postes, cumul compris.
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000109"}';
insert into public.audit_log (tenant_id, action, entity_type)
values ('ab000000-0000-4000-8000-000000000001', 'update', 'order');
reset role;
select is((select user_role from public.audit_log where action = 'update' and tenant_id = 'ab000000-0000-4000-8000-000000000001'),
  'cashier+waiter', 'audit: user_role recoit les postes de l auteur, cumul compris');
set local role authenticated;

-- ===========================================================================
-- Paiements de l'abonnement : billing.manage, meme limite
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000102"}';
select is(public.tenant_permission_level('ab000000-0000-4000-8000-000000000001', 'billing.manage'), 'limited',
  'factures: le gerant n a billing.manage que limite');
select is((select count(*)::int from public.flutterwave_payments), 1,
  'factures: un gerant lit les paiements de l abonnement (niveau limite accepte en LECTURE)');
select ok(not public.has_tenant_write_permission('ab000000-0000-4000-8000-000000000001', 'billing.manage'),
  'factures: ce niveau limite ne passe aucune garde d ecriture');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000105"}';
select is((select count(*)::int from public.flutterwave_payments), 0,
  'factures: un chef ne lit PAS les paiements de l abonnement');

-- ===========================================================================
-- Invitations : team.manage
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000102"}';
select is((select count(id)::int from public.invitations), 1, 'invitations: un gerant lit les invitations');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000104"}';
select is((select count(id)::int from public.invitations), 0, 'invitations: un caissier ne lit PAS les invitations');
-- Les deux politiques mortes d'ecriture ont disparu, et aucun grant d'ecriture.
reset role;
select is((select count(*)::int from pg_policies
            where schemaname = 'public' and tablename = 'invitations' and cmd in ('INSERT', 'UPDATE')), 0,
  'invitations: plus aucune politique INSERT ni UPDATE (toute ecriture passe par le serveur)');
select is(has_table_privilege('authenticated', 'public.invitations', 'INSERT')
       or has_table_privilege('authenticated', 'public.invitations', 'UPDATE')
       or has_column_privilege('authenticated', 'public.invitations', 'postes', 'SELECT')
       or has_column_privilege('authenticated', 'public.invitations', 'permission_overrides', 'SELECT'), false,
  'invitations: authenticated n ecrit pas la table et ne lit ni postes ni permission_overrides');
set local role authenticated;

-- ===========================================================================
-- Autorite d'argent : les quatre droits ensemble
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000102"}';
select ok(public.has_tenant_money_permission('ab000000-0000-4000-8000-000000000001'), 'argent: un gerant a l autorite d argent');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000104"}';
select ok(not public.has_tenant_money_permission('ab000000-0000-4000-8000-000000000001'),
  'argent: un caissier par defaut ne l a PAS (annuler, remiser, rembourser sont limites)');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000107"}';
select ok(not public.has_tenant_money_permission('ab000000-0000-4000-8000-000000000001'),
  'argent: un caissier a qui l on donne orders.refund SEUL ne l a PAS (un droit n ouvre pas le lot)');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000108"}';
select ok(public.has_tenant_money_permission('ab000000-0000-4000-8000-000000000001'),
  'argent temoin: un caissier avec les quatre droits l a');

-- ===========================================================================
-- Plan de salle : settings.edit
-- ===========================================================================
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000102"}';
select ok(public.has_tenant_floor_permission('ab000000-0000-4000-8000-000000000001'), 'salle: un gerant gere le plan de salle');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000106"}';
select ok(not public.has_tenant_floor_permission('ab000000-0000-4000-8000-000000000001'),
  'salle: un serveur ne gere PAS le plan de salle');
set local request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000104"}';
select ok(not public.has_tenant_floor_permission('ab000000-0000-4000-8000-000000000001'),
  'salle: un caissier non plus, alors qu il prend des commandes');

select * from finish();
rollback;
