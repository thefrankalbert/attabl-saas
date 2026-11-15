-- RAPPELS INTELLIGENTS (20261115120000).
--
-- Ce que ces tests figent:
--   - orders.ready_at se remplit au passage a "prete" et se vide au retour en
--     cuisine, quel que soit l'appelant (declencheur);
--   - reminders: chacun ne lit que SES rappels; personne n'ecrit par l'API
--     (le moteur ecrit en service_role); anon ne lit rien;
--   - reminder_settings: lisible par les membres du restaurant, modifiable
--     seulement avec 'settings.edit' (pas un serveur), jamais par un autre
--     restaurant;
--   - reminder_preferences: chacun ne gere que les siennes.
--
-- MESURE ANTI-FAUX-VERT: chaque refus d'ecriture est verifie par l'ETAT relu
-- en superutilisateur (une ecriture refusee par la RLS peut toucher 0 ligne
-- sans erreur), chaque succes par la ligne relue.
--
-- Execution: scripts/run-pgtap.sh --local (ou la CI .github/workflows/pgtap.yml)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur.rappel@test.local', 'x', now(), now()),
  ('f2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron.rappel@test.local', 'x', now(), now()),
  ('f3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'etranger.rappel@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active) values
  ('f5555555-5555-4555-8555-555555555555', 'tenant-rappel-a', 'Resto A', true),
  ('f6666666-6666-4666-8666-666666666666', 'tenant-rappel-b', 'Resto B', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active) values
  ('fa000000-0000-4000-8000-00000000000a', 'f5555555-5555-4555-8555-555555555555',
   'f1111111-1111-1111-1111-111111111111', 'serveur.rappel@test.local', 'waiter', true),
  ('fb000000-0000-4000-8000-00000000000b', 'f5555555-5555-4555-8555-555555555555',
   'f2222222-2222-2222-2222-222222222222', 'patron.rappel@test.local', 'owner', true),
  ('fc000000-0000-4000-8000-00000000000c', 'f6666666-6666-4666-8666-666666666666',
   'f3333333-3333-3333-3333-333333333333', 'etranger.rappel@test.local', 'owner', true);

insert into public.reminders (tenant_id, rule, subject_key, recipient_id) values
  ('f5555555-5555-4555-8555-555555555555', 'order_ready_not_served', 'o1', 'fa000000-0000-4000-8000-00000000000a'),
  ('f5555555-5555-4555-8555-555555555555', 'weekly_coach', '2026-11-16', 'fb000000-0000-4000-8000-00000000000b');

-- ===========================================================================
-- 1. orders.ready_at (3)
-- ===========================================================================
insert into public.orders (id, tenant_id, order_number, status, subtotal, total)
values ('fd000000-0000-4000-8000-00000000000d', 'f5555555-5555-4555-8555-555555555555',
        'CMD-RAPPEL-1', 'preparing', 1000, 1000);

select is(
  (select ready_at from public.orders where id = 'fd000000-0000-4000-8000-00000000000d'),
  null,
  'commande en preparation: pas de ready_at'
);
update public.orders set status = 'ready' where id = 'fd000000-0000-4000-8000-00000000000d';
select isnt(
  (select ready_at from public.orders where id = 'fd000000-0000-4000-8000-00000000000d'),
  null,
  'passage a prete: ready_at rempli par le declencheur'
);
update public.orders set status = 'preparing' where id = 'fd000000-0000-4000-8000-00000000000d';
select is(
  (select ready_at from public.orders where id = 'fd000000-0000-4000-8000-00000000000d'),
  null,
  'renvoyee en cuisine: ready_at vide (le prochain "prete" repart de zero)'
);

-- ===========================================================================
-- 2. reminders: lecture des siens seulement, aucune ecriture par l'API (4)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';

select is(
  (select count(*)::int from public.reminders),
  1,
  'serveur: ne voit que son propre rappel (pas le bilan du patron)'
);
select throws_ok(
  $$insert into public.reminders (tenant_id, rule, subject_key, recipient_id)
    values ('f5555555-5555-4555-8555-555555555555', 'order_not_started', 'x',
            'fa000000-0000-4000-8000-00000000000a')$$,
  '42501',
  null,
  'serveur: ne peut pas fabriquer un rappel par l API'
);
update public.reminders set resolved_at = now() where subject_key = 'o1';
reset role;
select is(
  (select resolved_at from public.reminders where subject_key = 'o1'),
  null,
  'serveur: ne peut pas marquer son rappel regle (relu)'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.reminders$$,
  '42501',
  null,
  'anon: aucun acces aux rappels'
);
reset role;

-- ===========================================================================
-- 3. reminder_settings: settings.edit seulement (5)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';
select throws_ok(
  $$insert into public.reminder_settings (tenant_id, config)
    values ('f5555555-5555-4555-8555-555555555555', '{"ready_not_served_min": 30}')$$,
  '42501',
  null,
  'serveur: ne peut pas changer les reglages des rappels'
);

set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222"}';
select lives_ok(
  $$insert into public.reminder_settings (tenant_id, config)
    values ('f5555555-5555-4555-8555-555555555555', '{"ready_not_served_min": 5}')$$,
  'patron: enregistre les reglages des rappels'
);

set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';
select is(
  (select (config ->> 'ready_not_served_min')::int from public.reminder_settings),
  5,
  'serveur: lit les reglages de son restaurant'
);
update public.reminder_settings set config = '{"ready_not_served_min": 30}'
  where tenant_id = 'f5555555-5555-4555-8555-555555555555';

set local request.jwt.claims = '{"sub":"f3333333-3333-3333-3333-333333333333"}';
select is(
  (select count(*)::int from public.reminder_settings),
  0,
  'autre restaurant: ne voit pas les reglages de A'
);
reset role;
select is(
  (select (config ->> 'ready_not_served_min')::int from public.reminder_settings
    where tenant_id = 'f5555555-5555-4555-8555-555555555555'),
  5,
  'la tentative de modification du serveur n a rien change (relu)'
);

-- ===========================================================================
-- 4. reminder_preferences: chacun les siennes (4)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f1111111-1111-1111-1111-111111111111"}';
select lives_ok(
  $$insert into public.reminder_preferences (admin_user_id, tenant_id, rule, muted)
    values ('fa000000-0000-4000-8000-00000000000a', 'f5555555-5555-4555-8555-555555555555',
            'order_ready_not_served', true)$$,
  'serveur: coupe un rappel pour lui'
);
select throws_ok(
  $$insert into public.reminder_preferences (admin_user_id, tenant_id, rule, muted)
    values ('fb000000-0000-4000-8000-00000000000b', 'f5555555-5555-4555-8555-555555555555',
            'weekly_coach', true)$$,
  '42501',
  null,
  'serveur: ne peut pas couper un rappel au nom du patron'
);

set local request.jwt.claims = '{"sub":"f2222222-2222-2222-2222-222222222222"}';
select is(
  (select count(*)::int from public.reminder_preferences),
  0,
  'patron: ne voit pas les preferences personnelles du serveur'
);
reset role;
select is(
  (select count(*)::int from public.reminder_preferences
    where admin_user_id = 'fb000000-0000-4000-8000-00000000000b'),
  0,
  'aucune preference ecrite au nom du patron (relu)'
);

-- ===========================================================================
-- 5. Agregats (ventes d'un restaurant): service_role seulement (3)
-- ===========================================================================
select ok(
  not has_function_privilege('authenticated',
    'public.reminder_coach_items(uuid, timestamptz, timestamptz, timestamptz)', 'execute'),
  'authenticated: ne peut pas lire les ventes par plat d un restaurant'
);
select ok(
  not has_function_privilege('anon',
    'public.reminder_coach_slots(uuid, timestamptz, timestamptz, text)', 'execute'),
  'anon: ne peut pas lire les heures de pointe d un restaurant'
);
select ok(
  has_function_privilege('service_role',
    'public.reminder_rule_stats(timestamptz, integer)', 'execute'),
  'service_role (moteur, console): peut lire les mesures'
);

select * from finish();
rollback;
