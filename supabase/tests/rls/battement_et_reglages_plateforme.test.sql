-- BATTEMENT DES TACHES + REGLAGES PLATEFORME (20261115180000).
--
-- Ce que ces tests figent:
--   - cron_heartbeats: invisible et non modifiable par anon et authenticated
--     (la tache et la console passent par service_role);
--   - platform_settings: lisible par tout membre connecte (page d'aide),
--     modifiable seulement par un super administrateur; anon ne lit rien.
--
-- MESURE ANTI-FAUX-VERT: chaque refus d'ecriture est verifie par l'ETAT relu
-- en superutilisateur (une ecriture refusee par la RLS peut toucher 0 ligne
-- sans erreur).
--
-- Execution: scripts/run-pgtap.sh --local (ou la CI .github/workflows/pgtap.yml)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron.reglages@test.local', 'x', now(), now()),
  ('e2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'super.reglages@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active) values
  ('e5555555-5555-4555-8555-555555555555', 'tenant-reglages', 'Resto R', true);

-- Le declencheur prevent_super_admin_elevation n'accepte un super admin que
-- d'un appel service_role (claim legacy), comme dans retention_purges.test.sql.
set local request.jwt.claim.role = 'service_role';
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, is_super_admin) values
  ('ea000000-0000-4000-8000-00000000000a', 'e5555555-5555-4555-8555-555555555555',
   'e1111111-1111-1111-1111-111111111111', 'patron.reglages@test.local', 'owner', true, false),
  ('eb000000-0000-4000-8000-00000000000b', 'e5555555-5555-4555-8555-555555555555',
   'e2222222-2222-2222-2222-222222222222', 'super.reglages@test.local', 'super_admin', true, true);
set local request.jwt.claim.role = '';

insert into public.cron_heartbeats (job, schedule, last_run_at, last_status, last_duration_ms)
values ('reminders', '* * * * *', now(), 'ok', 10);
insert into public.platform_settings (key, value) values
  ('support_contact', '{"phone": "+226 65 56 54 11"}');

-- ===========================================================================
-- 1. cron_heartbeats: service_role seulement (3)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222","aal":"aal2"}';
select throws_ok(
  $$select count(*) from public.cron_heartbeats$$,
  '42501', null,
  'meme un super admin ne lit pas les battements par l API (console = service_role)'
);
select throws_ok(
  $$update public.cron_heartbeats set last_status = 'error'$$,
  '42501', null,
  'aucun membre ne peut fabriquer un battement'
);
reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.cron_heartbeats$$,
  '42501', null,
  'anon: aucun acces aux battements'
);
reset role;

-- ===========================================================================
-- 2. platform_settings (6)
-- ===========================================================================
set local role anon;
select throws_ok(
  $$select count(*) from public.platform_settings$$,
  '42501', null,
  'anon: ne lit pas les reglages de la plateforme'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111"}';
select is(
  (select value ->> 'phone' from public.platform_settings where key = 'support_contact'),
  '+226 65 56 54 11',
  'membre connecte: lit le numero du support'
);
update public.platform_settings set value = '{"phone": "+1 555 000 0000"}'
  where key = 'support_contact';
select throws_ok(
  $$insert into public.platform_settings (key, value) values ('support_contact', '{}')
    on conflict (key) do update set value = excluded.value$$,
  '42501', null,
  'proprietaire de restaurant: ne peut pas reecrire le numero du support'
);
reset role;
select is(
  (select value ->> 'phone' from public.platform_settings where key = 'support_contact'),
  '+226 65 56 54 11',
  'la tentative du proprietaire n a rien change (relu)'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222","aal":"aal2"}';
select lives_ok(
  $$update public.platform_settings set value = '{"phone": "+237 6 99 00 11 22"}'
    where key = 'support_contact'$$,
  'super admin: modifie le numero du support'
);
reset role;
select is(
  (select value ->> 'phone' from public.platform_settings where key = 'support_contact'),
  '+237 6 99 00 11 22',
  'la modification du super admin est enregistree (relu)'
);

-- ===========================================================================
-- 3. Suppression et ajout (3)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111"}';
delete from public.platform_settings where key = 'support_contact';
reset role;
select is(
  (select count(*)::int from public.platform_settings where key = 'support_contact'),
  1,
  'proprietaire de restaurant: ne peut pas supprimer le numero du support (relu)'
);

delete from public.platform_settings;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222","aal":"aal2"}';
select lives_ok(
  $$insert into public.platform_settings (key, value) values ('support_contact', '{"phone": "+221 77 000 00 00"}')$$,
  'super admin: ajoute le numero du support'
);
reset role;
select is(
  (select value ->> 'phone' from public.platform_settings where key = 'support_contact'),
  '+221 77 000 00 00',
  'l ajout du super admin est enregistre (relu)'
);

select * from finish();
rollback;
