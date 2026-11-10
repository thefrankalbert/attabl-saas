-- "LU" EST UN ETAT PAR PERSONNE (20261109210000 + 20261109220000).
--
-- Avant: une notification diffusee (user_id NULL) portait UN drapeau `read`
-- pour tout le restaurant. Un serveur qui vidait sa cloche la marquait lue
-- pour le proprietaire aussi, qui ne voyait plus la nouvelle commande.
--
-- MESURE ANTI-FAUX-VERT: chaque refus est verifie par l'ETAT relu (drapeau
-- partage inchange, aucune ligne ecrite), chaque succes par la ligne relue.
--
-- Couvre les DEUX migrations: 20261109210000 (table notification_reads) et
-- 20261109220000 (le drapeau partage n'est plus modifiable par un membre).
--
-- Execution: scripts/run-pgtap.sh --local (ou la CI .github/workflows/pgtap.yml)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur.notif@test.local', 'x', now(), now()),
  ('e2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron.notif@test.local', 'x', now(), now()),
  ('e3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'etranger.notif@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active) values
  ('e5555555-5555-4555-8555-555555555555', 'tenant-notif-a', 'Resto A', true),
  ('e6666666-6666-4666-8666-666666666666', 'tenant-notif-b', 'Resto B', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active) values
  (gen_random_uuid(), 'e5555555-5555-4555-8555-555555555555',
   'e1111111-1111-1111-1111-111111111111', 'serveur.notif@test.local', 'waiter', true),
  (gen_random_uuid(), 'e5555555-5555-4555-8555-555555555555',
   'e2222222-2222-2222-2222-222222222222', 'patron.notif@test.local', 'owner', true),
  (gen_random_uuid(), 'e6666666-6666-4666-8666-666666666666',
   'e3333333-3333-3333-3333-333333333333', 'etranger.notif@test.local', 'owner', true);

insert into public.notifications (id, tenant_id, user_id, type, title, read) values
  -- Diffusee a tout le restaurant A.
  ('e7000000-0000-4000-8000-000000000001', 'e5555555-5555-4555-8555-555555555555',
   null, 'info', 'Nouvelle commande', false),
  -- Personnelle, au patron.
  ('e7000000-0000-4000-8000-000000000002', 'e5555555-5555-4555-8555-555555555555',
   'e2222222-2222-2222-2222-222222222222', 'info', 'Pour le patron', false);

set local role authenticated;

-- ===========================================================================
-- 1. Le serveur ne bascule plus le drapeau partage (2)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111"}';

update public.notifications set read = true
  where id = 'e7000000-0000-4000-8000-000000000001';

reset role;
select is(
  (select read from public.notifications where id = 'e7000000-0000-4000-8000-000000000001'),
  false,
  'serveur: le drapeau partage de la notification diffusee reste a false'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"e1111111-1111-1111-1111-111111111111"}';

-- ===========================================================================
-- 2. Il marque lu POUR LUI (3)
-- ===========================================================================
select lives_ok(
  $$insert into public.notification_reads (notification_id, tenant_id)
    values ('e7000000-0000-4000-8000-000000000001', 'e5555555-5555-4555-8555-555555555555')$$,
  'serveur: marque la notification diffusee lue pour lui'
);
select is(
  (select count(*)::int from public.notification_reads
    where notification_id = 'e7000000-0000-4000-8000-000000000001'),
  1,
  'serveur: sa ligne de lecture existe, a son nom (user_id par defaut = auth.uid())'
);
select throws_ok(
  $$insert into public.notification_reads (notification_id, tenant_id)
    values ('e7000000-0000-4000-8000-000000000002', 'e5555555-5555-4555-8555-555555555555')$$,
  '42501',
  null,
  'serveur: ne touche pas a une notification personnelle du patron'
);

-- ===========================================================================
-- 3. Le patron, lui, la voit toujours non lue (2)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"e2222222-2222-2222-2222-222222222222"}';

select is(
  (select count(*)::int from public.notification_reads
    where notification_id = 'e7000000-0000-4000-8000-000000000001'),
  0,
  'patron: la lecture du serveur ne compte pas pour lui'
);
-- Temoin POSITIF du resserrement de 20261109220000: le patron garde le droit
-- de marquer lue SA notification personnelle. On RELIT le drapeau, car un
-- UPDATE refuse par la RLS toucherait 0 ligne sans lever d'erreur.
update public.notifications set read = true
  where id = 'e7000000-0000-4000-8000-000000000002';
reset role;
select is(
  (select read from public.notifications where id = 'e7000000-0000-4000-8000-000000000002'),
  true,
  'patron: garde le drapeau de SA notification personnelle (relu)'
);
set local role authenticated;

-- ===========================================================================
-- 4. Un autre restaurant ne marque rien chez A (2)
-- ===========================================================================
set local request.jwt.claims = '{"sub":"e3333333-3333-3333-3333-333333333333"}';

select throws_ok(
  $$insert into public.notification_reads (notification_id, tenant_id)
    values ('e7000000-0000-4000-8000-000000000001', 'e5555555-5555-4555-8555-555555555555')$$,
  '42501',
  null,
  'etranger: refuse sur une notification d un autre restaurant'
);
select throws_ok(
  $$insert into public.notification_reads (notification_id, tenant_id)
    values ('e7000000-0000-4000-8000-000000000001', 'e6666666-6666-4666-8666-666666666666')$$,
  '42501',
  null,
  'etranger: refuse meme en declarant son propre restaurant'
);

select * from finish();
rollback;
