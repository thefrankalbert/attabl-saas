-- Revue ligne par ligne, lot B2a: defauts restants cote base de donnees.
--
-- CE QUE CE TEST VERROUILLE (une section par constat, migrations
-- 20261124110000 a 20261124111000):
--   B103 ecriture de `tenants` = `settings.edit` (proprietaire, gerant,
--        delegation dans les deux sens). L'ancien role `admin` est couvert
--        une seule fois, dans transition_anciens_roles.test.sql;
--   B147 lecture de `tenants` par les seuls membres actifs;
--   B148 `apply_flutterwave_payment`: "doublon" seulement pour la MEME
--        transaction;
--   B149 purge legale d'un restaurant ferme hors verrou Inventaire, verrou
--        intact pour un restaurant vivant;
--   B110 auteur du journal d'audit force depuis la session;
--   B130 auteur d'une note de commande force depuis la session;
--   B139 reabonnement push d'un membre desactive dans un autre restaurant;
--   B111 session de connexion: (user_id, tenant_id) d'une meme ligne;
--   B112 `get_owner_dashboard` supprimee;
--   B108 plus d'insertion anonyme dans `newsletter_subscriber`;
--   B120 `get_stock_status.is_low` pour un stock nul ou negatif;
--   B109 translitteration de `generate_menu_slug`, caractere par caractere.
--
-- Chaque refus a son temoin positif (le cas legitime passe toujours).
-- Sans les migrations du lot, les assertions marquees "(avant: ...)" echouent.
--
-- Execution: psql "$LOCAL_DB" -X -A -t -f supabase/tests/rls/revue_lot_b2a.test.sql
-- (PAS `psql -q`: il formate le TAP en tableau et masque les echecs.)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(77);

-- ---------------------------------------------------------------------------
-- Donnees
-- ---------------------------------------------------------------------------
-- T1 restaurant principal (business actif), T2 second restaurant, TX futur
-- restaurant ferme, TL restaurant vivant sans droit Inventaire, TS restaurant
-- sans carte (slugs), TF restaurant en essai (Flutterwave).
insert into public.tenants (id, slug, name, is_active, currency, subscription_status, subscription_plan, tax_rate) values
  ('b2a00000-0000-4000-8000-000000000001', 'b2a-un', 'B2A Un', true, 'XOF', 'active', 'business', 18),
  ('b2a00000-0000-4000-8000-000000000002', 'b2a-deux', 'B2A Deux', true, 'XOF', 'active', 'business', 18),
  ('b2a00000-0000-4000-8000-000000000003', 'b2a-ferme', 'B2A Ferme', true, 'XOF', 'active', 'business', 18),
  ('b2a00000-0000-4000-8000-000000000004', 'b2a-vivant', 'B2A Vivant', true, 'XOF', 'active', 'starter', 18),
  ('b2a00000-0000-4000-8000-000000000005', 'b2a-slug', 'B2A Slug', true, 'XOF', 'active', 'business', 18);
insert into public.tenants (id, slug, name, is_active, currency, subscription_status, subscription_plan, trial_ends_at) values
  ('b2a00000-0000-4000-8000-000000000006', 'b2a-flw', 'B2A FLW', true, 'XOF', 'trial', 'starter', now() + interval '5 days');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
select ('b2a00000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       e, 'x', now(), now()
from (values (1, 'patron@b2a.test'), (2, 'admin@b2a.test'), (3, 'gerant@b2a.test'),
             (4, 'admin-retire@b2a.test'), (5, 'caissier-delegue@b2a.test'),
             (6, 'serveur@b2a.test'), (7, 'desactive@b2a.test'), (8, 'mobile@b2a.test'),
             (9, 'admin-ferme@b2a.test')) v(n, e);

insert into public.admin_users (id, user_id, tenant_id, email, role, is_active, custom_permissions) values
  ('b2a00000-0000-4000-8000-000000000201', 'b2a00000-0000-4000-8000-000000000101', 'b2a00000-0000-4000-8000-000000000001', 'patron@b2a.test', 'owner', true, null),
  ('b2a00000-0000-4000-8000-000000000202', 'b2a00000-0000-4000-8000-000000000102', 'b2a00000-0000-4000-8000-000000000001', 'admin@b2a.test', 'manager', true, null),
  ('b2a00000-0000-4000-8000-000000000203', 'b2a00000-0000-4000-8000-000000000103', 'b2a00000-0000-4000-8000-000000000001', 'gerant@b2a.test', 'manager', true, null),
  ('b2a00000-0000-4000-8000-000000000204', 'b2a00000-0000-4000-8000-000000000104', 'b2a00000-0000-4000-8000-000000000001', 'admin-retire@b2a.test', 'manager', true, '{"settings.edit": false}'::jsonb),
  ('b2a00000-0000-4000-8000-000000000205', 'b2a00000-0000-4000-8000-000000000105', 'b2a00000-0000-4000-8000-000000000001', 'caissier-delegue@b2a.test', 'cashier', true, '{"settings.edit": true}'::jsonb),
  ('b2a00000-0000-4000-8000-000000000206', 'b2a00000-0000-4000-8000-000000000106', 'b2a00000-0000-4000-8000-000000000001', 'serveur@b2a.test', 'waiter', true, null),
  ('b2a00000-0000-4000-8000-000000000207', 'b2a00000-0000-4000-8000-000000000107', 'b2a00000-0000-4000-8000-000000000001', 'desactive@b2a.test', 'manager', false, null),
  -- Le "mobile": desactive dans T1, membre actif de T2.
  ('b2a00000-0000-4000-8000-000000000208', 'b2a00000-0000-4000-8000-000000000108', 'b2a00000-0000-4000-8000-000000000001', 'mobile@b2a.test', 'waiter', false, null),
  ('b2a00000-0000-4000-8000-000000000209', 'b2a00000-0000-4000-8000-000000000108', 'b2a00000-0000-4000-8000-000000000002', 'mobile@b2a.test', 'waiter', true, null),
  -- Administrateur du futur restaurant ferme TX: la fermeture ne desactive pas les membres.
  ('b2a00000-0000-4000-8000-000000000210', 'b2a00000-0000-4000-8000-000000000109', 'b2a00000-0000-4000-8000-000000000003', 'admin-ferme@b2a.test', 'manager', true, null);

insert into public.orders (id, tenant_id, order_number, status, payment_status, subtotal, total) values
  ('b2a00000-0000-4000-8000-000000000301', 'b2a00000-0000-4000-8000-000000000001', 'B2A-1', 'pending', 'pending', 5000, 5000);

-- ===========================================================================
-- B103: ecriture de `tenants` = `settings.edit`
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000101","role":"authenticated"}';
update public.tenants set tax_rate = 19 where id = 'b2a00000-0000-4000-8000-000000000001';
reset role;
select is((select tax_rate::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 19,
  'B103 temoin: le proprietaire change la TVA (onboarding et reglages)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000102","role":"authenticated"}';
update public.tenants set tax_rate = 20 where id = 'b2a00000-0000-4000-8000-000000000001';
reset role;
select is((select tax_rate::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 20,
  'B103 temoin: un gerant (settings.edit par defaut) change la TVA');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000103","role":"authenticated"}';
update public.tenants set tax_rate = 21 where id = 'b2a00000-0000-4000-8000-000000000001';
reset role;
select is((select tax_rate::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 21,
  'B103: un second gerant change aussi la TVA (lot 1 des roles: settings.edit par defaut)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000104","role":"authenticated"}';
update public.tenants set tax_rate = 22 where id = 'b2a00000-0000-4000-8000-000000000001';
reset role;
select is((select tax_rate::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 21,
  'B103: un gerant a qui le proprietaire a retire settings.edit ne change PAS la TVA (avant: 22)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000105","role":"authenticated"}';
update public.tenants set tax_rate = 23 where id = 'b2a00000-0000-4000-8000-000000000001';
reset role;
select is((select tax_rate::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 23,
  'B103: un caissier a qui le proprietaire a delegue settings.edit enregistre vraiment (avant: 20)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000106","role":"authenticated"}';
update public.tenants set tax_rate = 24 where id = 'b2a00000-0000-4000-8000-000000000001';
reset role;
select is((select tax_rate::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 23,
  'B103 temoin: un serveur ne change pas la TVA');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000107","role":"authenticated"}';
update public.tenants set tax_rate = 25 where id = 'b2a00000-0000-4000-8000-000000000001';
reset role;
select is((select tax_rate::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 23,
  'B103 temoin: un gerant desactive ne change pas la TVA');

select ok(
  (select pg_get_expr(polqual, polrelid) from pg_policy
    where polrelid = 'public.tenants'::regclass and polname = 'Settings managers can update own tenant')
    like '%settings.edit%'
  and (select pg_get_expr(polwithcheck, polrelid) from pg_policy
    where polrelid = 'public.tenants'::regclass and polname = 'Settings managers can update own tenant')
    like '%settings.edit%',
  'B103: USING et WITH CHECK de la politique d ecriture passent settings.edit');

-- ===========================================================================
-- B147: lecture de `tenants` par les seuls membres actifs
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000107","role":"authenticated"}';
select is((select count(id)::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 0,
  'B147: un membre desactive ne lit plus la ligne de son ancien restaurant (avant: 1)');

set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000106","role":"authenticated"}';
select is((select count(id)::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 1,
  'B147 temoin: un membre actif lit toujours son restaurant');
select is((select count(id)::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000002'), 0,
  'B147 temoin: un membre ne lit pas un restaurant dont il n est pas membre');
reset role;

set local role anon;
select is((select count(id)::int from public.tenants where id = 'b2a00000-0000-4000-8000-000000000001'), 1,
  'B147 temoin: la lecture publique d un restaurant actif est intacte');
reset role;

-- ===========================================================================
-- B148: "doublon" seulement pour la MEME transaction Flutterwave
-- ===========================================================================
insert into public.flutterwave_payments (id, tenant_id, tx_ref, plan, billing_interval, amount, currency, status, created_at) values
  ('b2a00000-0000-4000-8000-000000000401', 'b2a00000-0000-4000-8000-000000000006', 'atb_b2a_1', 'pro', 'monthly', 79000, 'XOF', 'pending', now());

select is(public.apply_flutterwave_payment('b2a00000-0000-4000-8000-000000000401', 9001, 79000, 79000, false, now()) ->> 'outcome',
  'applied', 'B148 temoin: la premiere transaction est appliquee');
select is(public.apply_flutterwave_payment('b2a00000-0000-4000-8000-000000000401', 9002, 79000, 79000, false, now()) ->> 'outcome',
  'already_settled_by_other_transaction',
  'B148: une AUTRE transaction sur une tentative deja reglee n est pas un doublon (avant: duplicate)');
select is(public.apply_flutterwave_payment('b2a00000-0000-4000-8000-000000000401', 9001, 79000, 79000, false, now()) ->> 'outcome',
  'duplicate', 'B148 temoin: la MEME transaction rejouee reste un doublon');
select is((select row(status, flw_transaction_id)::text from public.flutterwave_payments where id = 'b2a00000-0000-4000-8000-000000000401'),
  row('successful', 9001::bigint)::text,
  'B148: la ligne garde la transaction qui l a reglee, rien n est ecrit pour la seconde');
select ok(
  not has_function_privilege('authenticated', 'public.apply_flutterwave_payment(uuid,bigint,bigint,bigint,boolean,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.apply_flutterwave_payment(uuid,bigint,bigint,bigint,boolean,timestamptz)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.apply_flutterwave_payment(uuid,bigint,bigint,bigint,boolean,timestamptz)', 'EXECUTE'),
  'B148: droits inchanges (service_role seulement)');

-- ===========================================================================
-- B149: purge legale hors verrou Inventaire
-- ===========================================================================
-- Fournisseur, ingredient et inventaire sont crees quand TX avait droit au
-- module, puis TX perd son essai (frozen) et ferme depuis 40 jours: le cas
-- exact de l essai L143.
insert into public.suppliers (id, tenant_id, name, contact_name, phone, email) values
  ('b2a00000-0000-4000-8000-000000000501', 'b2a00000-0000-4000-8000-000000000003', 'Fournisseur', 'Awa', '+22670000000', 'awa@fournisseur.test');
insert into public.ingredients (id, tenant_id, name, unit) values
  ('b2a00000-0000-4000-8000-000000000502', 'b2a00000-0000-4000-8000-000000000003', 'Farine', 'kg');
insert into public.stock_counts (id, tenant_id) values
  ('b2a00000-0000-4000-8000-000000000503', 'b2a00000-0000-4000-8000-000000000003');
insert into public.stock_count_lines (id, tenant_id, count_id, ingredient_id) values
  ('b2a00000-0000-4000-8000-000000000504', 'b2a00000-0000-4000-8000-000000000003',
   'b2a00000-0000-4000-8000-000000000503', 'b2a00000-0000-4000-8000-000000000502');
update public.tenants
   set subscription_status = 'frozen', freeze_reason = 'trial_expired', is_active = false,
       deleted_at = now() - interval '40 days'
 where id = 'b2a00000-0000-4000-8000-000000000003';

-- Une SESSION CLIENTE du restaurant ferme reste refusee sur CHAQUE table et
-- chaque ecriture couvertes par le verrou (contre-audit 1: la premiere version
-- laissait l administrateur creer fournisseurs et ingredients, en 201).
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000109","role":"authenticated"}';
select throws_ok(
  $$insert into public.suppliers (tenant_id, name) values ('b2a00000-0000-4000-8000-000000000003', 'Ajout ferme')$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: un membre d un restaurant ferme ne cree pas de fournisseur');
select throws_ok(
  $$update public.suppliers set name = 'Renomme' where id = 'b2a00000-0000-4000-8000-000000000501'$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: un membre d un restaurant ferme ne modifie pas un fournisseur');
select throws_ok(
  $$insert into public.ingredients (tenant_id, name, unit) values ('b2a00000-0000-4000-8000-000000000003', 'Sucre', 'kg')$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: un membre d un restaurant ferme ne cree pas d ingredient');
select throws_ok(
  $$insert into public.stock_counts (tenant_id) values ('b2a00000-0000-4000-8000-000000000003')$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: un membre d un restaurant ferme n ouvre pas d inventaire');
select throws_ok(
  $$update public.stock_counts set reference = 'x' where id = 'b2a00000-0000-4000-8000-000000000503'$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: un membre d un restaurant ferme ne modifie pas un inventaire');
select throws_ok(
  $$insert into public.stock_count_lines (tenant_id, count_id, ingredient_id)
    values ('b2a00000-0000-4000-8000-000000000003', 'b2a00000-0000-4000-8000-000000000503',
            'b2a00000-0000-4000-8000-000000000502')$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: un membre d un restaurant ferme n ajoute pas de ligne d inventaire');
select throws_ok(
  $$update public.stock_count_lines set counted_qty = 1 where id = 'b2a00000-0000-4000-8000-000000000504'$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: un membre d un restaurant ferme ne modifie pas une ligne d inventaire');
reset role;
-- Les reglages de jeton poses plus haut ne doivent pas influencer la purge.
set local "request.jwt.claims" = '';

-- Sans le drapeau de la purge, meme hors session cliente, le verrou tient.
select throws_ok(
  $$update public.suppliers set notes = 'x' where id = 'b2a00000-0000-4000-8000-000000000501'$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: la sortie exige le drapeau de la purge, pas seulement la fermeture');

-- Drapeau pose (par le proprietaire de la base, dans cette transaction): il ne
-- vaut QUE pour un restaurant ferme. Un restaurant vivant sans droit reste refuse.
select set_config('attabl.purge_legale', 'on', true);
select throws_ok(
  $$insert into public.suppliers (tenant_id, name) values ('b2a00000-0000-4000-8000-000000000004', 'Drapeau vivant')$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149: drapeau pose mais restaurant VIVANT sans droit Inventaire: refuse');
select lives_ok(
  $$insert into public.suppliers (tenant_id, name) values ('b2a00000-0000-4000-8000-000000000003', 'Drapeau ferme')$$,
  'B149 temoin: drapeau pose et restaurant ferme: accepte');
select set_config('attabl.purge_legale', '', true);

select lives_ok(
  $$select public.anonymize_closed_tenants(now() - interval '30 days')$$,
  'B149: la purge legale passe malgre un restaurant ferme sans droit Inventaire (avant: check_violation)');
select is((select row(contact_name, phone, email)::text from public.suppliers where id = 'b2a00000-0000-4000-8000-000000000501'),
  row(null::text, null::varchar, null::text)::text,
  'B149: les contacts du fournisseur du restaurant ferme sont effaces');
select isnt((select anonymized_at from public.tenants where id = 'b2a00000-0000-4000-8000-000000000003'), null,
  'B149: le restaurant ferme est marque anonymise');
select is(coalesce(current_setting('attabl.purge_legale', true), ''), '',
  'B149: la purge retire son drapeau en sortant');
select throws_ok(
  $$insert into public.suppliers (tenant_id, name) values ('b2a00000-0000-4000-8000-000000000004', 'Pirate')$$,
  '23514', 'Inventory module requires the Pro plan or higher',
  'B149 temoin: un restaurant VIVANT sans droit Inventaire reste refuse');
select lives_ok(
  $$insert into public.suppliers (tenant_id, name) values ('b2a00000-0000-4000-8000-000000000001', 'Legitime')$$,
  'B149 temoin: un restaurant vivant avec le droit cree un fournisseur');

-- ===========================================================================
-- B110: auteur du journal d audit force depuis la session
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000106","role":"authenticated","email":"serveur@b2a.test"}';
insert into public.audit_log (tenant_id, user_id, user_email, user_role, action, entity_type)
values ('b2a00000-0000-4000-8000-000000000001', null, 'patron@b2a.test', 'owner', 'update', 'setting');
-- Le gerant, sans e-mail dans le jeton: repli sur sa ligne admin_users.
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000103","role":"authenticated"}';
insert into public.audit_log (tenant_id, user_id, user_email, user_role, action, entity_type)
values ('b2a00000-0000-4000-8000-000000000001', null, 'patron@b2a.test', 'owner', 'update', 'menu');
reset role;

select is(
  (select row(user_id, user_email, user_role)::text from public.audit_log
    where tenant_id = 'b2a00000-0000-4000-8000-000000000001' and entity_type = 'setting'),
  row('b2a00000-0000-4000-8000-000000000106'::uuid, 'serveur@b2a.test', 'waiter')::text,
  'B110: un serveur ne signe plus une ligne d audit au nom du proprietaire (avant: NULL, patron, owner)');
select is(
  (select row(user_id, user_email, user_role)::text from public.audit_log
    where tenant_id = 'b2a00000-0000-4000-8000-000000000001' and entity_type = 'menu'),
  row('b2a00000-0000-4000-8000-000000000103'::uuid, 'gerant@b2a.test', 'manager')::text,
  'B110: sans e-mail dans le jeton, l e-mail vient de la ligne admin_users du restaurant');

-- Hors session client (proprietaire de la base, comme service_role ou une
-- fonction SECURITY DEFINER): l auteur fourni est garde.
insert into public.audit_log (tenant_id, user_id, user_email, user_role, action, entity_type)
values ('b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000101', 'patron@b2a.test', 'owner', 'delete', 'user');
select is(
  (select row(user_id, user_email, user_role)::text from public.audit_log
    where tenant_id = 'b2a00000-0000-4000-8000-000000000001' and entity_type = 'user'),
  row('b2a00000-0000-4000-8000-000000000101'::uuid, 'patron@b2a.test', 'owner')::text,
  'B110 temoin: hors session client, l auteur fourni est garde (gestion de l equipe)');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000106","role":"authenticated"}';
select throws_ok(
  $$insert into public.audit_log (tenant_id, action, entity_type)
    values ('b2a00000-0000-4000-8000-000000000002', 'update', 'setting')$$,
  '42501', null,
  'B110 temoin: la politique refuse toujours une ligne dans un autre restaurant');
reset role;

-- ===========================================================================
-- B130: auteur d une note de commande force depuis la session
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000106","role":"authenticated"}';
insert into public.order_notes (tenant_id, order_id, note, created_by)
values ('b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000301', 'Note pirate', 'b2a00000-0000-4000-8000-000000000201');
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000101","role":"authenticated"}';
insert into public.order_notes (tenant_id, order_id, note, created_by)
values ('b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000301', 'Note du patron', 'b2a00000-0000-4000-8000-000000000201');
reset role;

select is((select created_by from public.order_notes where note = 'Note pirate'),
  'b2a00000-0000-4000-8000-000000000206'::uuid,
  'B130: un serveur ne signe plus une note au nom du proprietaire (avant: ligne du proprietaire)');
select is((select created_by from public.order_notes where note = 'Note du patron'),
  'b2a00000-0000-4000-8000-000000000201'::uuid,
  'B130 temoin: la note du proprietaire porte bien sa ligne admin_users');
select is(
  (select count(*)::int from pg_trigger
    where tgrelid in ('public.audit_log'::regclass, 'public.order_notes'::regclass)
      and tgname in ('trg_audit_log_auteur_session', 'trg_order_notes_auteur_session')
      and not tgisinternal),
  2, 'B110/B130: les deux declencheurs BEFORE INSERT sont poses');
select is(
  (select count(*)::int from pg_proc
    where proname in ('audit_log_auteur_session', 'order_notes_auteur_session') and not prosecdef),
  2, 'B110/B130: les fonctions de declencheur sont SECURITY INVOKER (elles lisent current_user)');

-- ===========================================================================
-- B139: reabonnement push d un membre desactive dans un autre restaurant
-- ===========================================================================
insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth) values
  ('b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000108', 'https://fcm.googleapis.com/b2a/meme-appareil', 'p', 'a'),
  ('b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000108', 'https://fcm.googleapis.com/b2a/vieux', 'p', 'a');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000108","role":"authenticated"}';
select lives_ok(
  $$insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values ('b2a00000-0000-4000-8000-000000000002', 'b2a00000-0000-4000-8000-000000000108',
            'https://fcm.googleapis.com/b2a/meme-appareil', 'p2', 'a2')
    on conflict (tenant_id, user_id, endpoint) do update
      set p256dh = excluded.p256dh, auth = excluded.auth$$,
  -- Lot B2b-2 (B8, contre-audit 1): avec l'unicite (tenant_id, user_id, endpoint),
  -- c'est une simple INSERTION dans T2, sans conflit avec sa ligne de T1. Ce
  -- test ne prouve donc plus la politique USING de B139 (l'assertion 46 le fait).
  'B139/B8: le membre desactive dans T1 s abonne a T2 depuis le meme appareil (insertion dans T2, sans toucher sa ligne de T1)');
delete from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/b2a/vieux';
select throws_ok(
  $$insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values ('b2a00000-0000-4000-8000-000000000001', 'b2a00000-0000-4000-8000-000000000108',
            'https://fcm.googleapis.com/b2a/neuf', 'p', 'a')$$,
  '42501', null,
  'B139 temoin: il ne s abonne pas au restaurant ou il est desactive');
select throws_ok(
  $$update public.push_subscriptions set tenant_id = 'b2a00000-0000-4000-8000-000000000001'
     where endpoint = 'https://fcm.googleapis.com/b2a/meme-appareil'$$,
  '42501', null,
  'B139 temoin: il ne re-pointe pas sa ligne vers un restaurant ou il est desactive');
reset role;

-- Lot B2b-2 (B8): unicite (tenant_id, user_id, endpoint). Le reabonnement a T2
-- ajoute la ligne de T2; celle de T1 reste (inerte: l'envoi ne contacte que
-- les membres vivants du restaurant).
select is((select count(*)::int from public.push_subscriptions
            where endpoint = 'https://fcm.googleapis.com/b2a/meme-appareil'
              and tenant_id = 'b2a00000-0000-4000-8000-000000000002'), 1,
  'B139: l appareil est abonne a T2');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/b2a/vieux'), 0,
  'B139: il supprime son ancienne ligne de T1 (avant: zero ligne supprimee)');

-- Un tiers ne voit toujours pas les appareils des autres.
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000101","role":"authenticated"}';
select is((select count(*)::int from public.push_subscriptions where user_id = 'b2a00000-0000-4000-8000-000000000108'), 0,
  'B139 temoin: un autre compte ne lit pas ces appareils');
reset role;

-- ===========================================================================
-- B111: session de connexion = (user_id, tenant_id) d une meme ligne
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000106","role":"authenticated"}';
select throws_ok(
  $$insert into public.user_sessions (user_id, tenant_id)
    values ('b2a00000-0000-4000-8000-000000000206', 'b2a00000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'B111: un membre n insere pas une session au nom d un autre restaurant (avant: acceptee)');
select lives_ok(
  $$insert into public.user_sessions (user_id, tenant_id)
    values ('b2a00000-0000-4000-8000-000000000206', 'b2a00000-0000-4000-8000-000000000001')$$,
  'B111 temoin: la connexion insere sa session (ligne et restaurant de la meme ligne)');
select throws_ok(
  $$insert into public.user_sessions (user_id, tenant_id)
    values ('b2a00000-0000-4000-8000-000000000201', 'b2a00000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'B111 temoin: toujours pas de session au nom d un autre membre');
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000108","role":"authenticated"}';
select throws_ok(
  $$insert into public.user_sessions (user_id, tenant_id)
    values ('b2a00000-0000-4000-8000-000000000208', 'b2a00000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'B111: un membre desactive n insere pas de session dans ce restaurant (avant: acceptee)');
select lives_ok(
  $$insert into public.user_sessions (user_id, tenant_id)
    values ('b2a00000-0000-4000-8000-000000000209', 'b2a00000-0000-4000-8000-000000000002')$$,
  'B111 temoin: le meme compte insere sa session dans le restaurant ou il est actif');
reset role;

-- ===========================================================================
-- B112: get_owner_dashboard supprimee
-- ===========================================================================
select hasnt_function('public', 'get_owner_dashboard', array['uuid'],
  'B112: la fonction get_owner_dashboard n existe plus');

-- ===========================================================================
-- B108: plus d insertion anonyme dans newsletter_subscriber
-- ===========================================================================
set local role anon;
select throws_ok(
  $$insert into public.newsletter_subscriber (email) values ('robot@spam.test')$$,
  '42501', null,
  'B108: la cle anon n insere plus directement (avant: acceptee)');
reset role;
select is(has_table_privilege('authenticated', 'public.newsletter_subscriber', 'insert'), false,
  'B108: authenticated non plus');

-- ===========================================================================
-- B120: is_low pour un stock nul ou negatif sans seuil
-- ===========================================================================
insert into public.ingredients (tenant_id, name, unit, current_stock, min_stock_alert) values
  ('b2a00000-0000-4000-8000-000000000001', 'b2a-nul', 'kg', 0, 0),
  ('b2a00000-0000-4000-8000-000000000001', 'b2a-negatif', 'kg', -2, 0),
  ('b2a00000-0000-4000-8000-000000000001', 'b2a-sous-seuil', 'kg', 3, 5),
  ('b2a00000-0000-4000-8000-000000000001', 'b2a-au-dessus', 'kg', 10, 5),
  ('b2a00000-0000-4000-8000-000000000001', 'b2a-sans-seuil-positif', 'kg', 4, 0);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"b2a00000-0000-4000-8000-000000000101","role":"authenticated"}';
create temporary table b2a_stock on commit drop as
  select name, is_low from public.get_stock_status('b2a00000-0000-4000-8000-000000000001');
reset role;

select is((select is_low from b2a_stock where name = 'b2a-nul'), true,
  'B120: stock nul sans seuil = bas (avant: false)');
select is((select is_low from b2a_stock where name = 'b2a-negatif'), true,
  'B120: stock negatif sans seuil = bas (avant: false)');
select is((select is_low from b2a_stock where name = 'b2a-sous-seuil'), true,
  'B120 temoin: sous le seuil = bas');
select is((select is_low from b2a_stock where name = 'b2a-au-dessus'), false,
  'B120 temoin: au-dessus du seuil = pas bas');
select is((select is_low from b2a_stock where name = 'b2a-sans-seuil-positif'), false,
  'B120 temoin: stock positif sans seuil = pas bas');

-- ===========================================================================
-- B109: translitteration de generate_menu_slug, un caractere a la fois
-- ===========================================================================
select is(
  public.generate_menu_slug('b2a00000-0000-4000-8000-000000000005', 'x' || v.c || 'y'),
  'x' || v.e || 'y',
  'B109: ' || v.nom || ' -> ' || v.e)
from (values
  (U&'\00E0', 'a', 'a accent grave'),
  (U&'\00E2', 'a', 'a circonflexe'),
  (U&'\00E4', 'a', 'a trema'),
  (U&'\00E9', 'e', 'e accent aigu'),
  (U&'\00E8', 'e', 'e accent grave'),
  (U&'\00EA', 'e', 'e circonflexe'),
  (U&'\00EB', 'e', 'e trema'),
  (U&'\00EF', 'i', 'i trema'),
  (U&'\00EE', 'i', 'i circonflexe'),
  (U&'\00F4', 'o', 'o circonflexe'),
  (U&'\00F9', 'u', 'u accent grave (avant: o)'),
  (U&'\00FB', 'u', 'u circonflexe'),
  (U&'\00FC', 'u', 'u trema'),
  (U&'\00FF', 'y', 'y trema'),
  (U&'\00E7', 'c', 'c cedille'),
  (U&'\00F1', 'n', 'n tilde'),
  (' ', '-', 'espace')
) as v(c, e, nom);

select * from finish();
rollback;
