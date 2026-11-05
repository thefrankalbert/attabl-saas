-- LOT 8 / R1 - le role `authenticated` ne doit plus pouvoir INSERER ni SUPPRIMER
-- une ligne public.admin_users.
--
-- Ce que ce test prouve, et que rien d'autre ne peut prouver: le refus vient des
-- PRIVILEGES Postgres et des policies, pas du code applicatif. Un test a
-- Supabase simule ne peut pas en rendre compte, puisqu'il ne traverse ni les
-- GRANT ni le RLS. C'est la seule preuve qui vaille pour ce constat.
--
-- Il protege les DEUX sens:
--   - l'ecriture directe est refusee (correction, cas 2 et 3);
--   - un membre legitime garde sa lecture et la mise a jour des colonnes de la
--     liste blanche (non-regression, cas 1 et 4) - c'est le garde-fou de la
--     migration 20261105000000.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/admin_users_write_privileges.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

-- Jeu d essai: un tenant, son proprietaire, un serveur, et une victime qui
-- n appartient a aucun tenant (le compte qu un attaquant chercherait a
-- rattacher a son restaurant).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron@test.local', 'x', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'serveur@test.local', 'x', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'victime@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'tenant-test-lot8', 'Tenant Test LOT8', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'patron@test.local', 'owner', true),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002', 'serveur@test.local', 'waiter', true);

-- Ligne retiree par la plateforme (soft-delete): `deleted_at` + `is_active`.
insert into public.admin_users (id, tenant_id, user_id, email, role, is_active, deleted_at)
values
  ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000003', 'victime@test.local', 'manager', false, now());

-- ---------------------------------------------------------------------- setup
-- On joue le SERVEUR, le role le moins privilegie du tenant: s il peut ecrire,
-- tout le monde peut.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000002"}';

-- 1. NON-REGRESSION: la lecture de son equipe fonctionne toujours.
select is(
  (select count(*)::int from public.admin_users
    where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001'
      and deleted_at is null),
  2,
  'LOT8 non-regression: un membre actif lit toujours les lignes de son tenant'
);

-- 2. CORRECTION: plus aucune auto-promotion ni rattachement d un tiers.
--    C est la requete exacte du constat: le serveur se pose owner dans SON
--    tenant, ou colle le compte auth d un tiers dans son equipe.
select throws_ok(
  $$insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000002', 'serveur@test.local', 'owner', true)$$,
  '42501',
  null,
  'LOT8 R1: INSERT direct dans admin_users refuse au role authenticated (42501)'
);

select throws_ok(
  $$insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
    values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001',
            'aaaaaaaa-0000-0000-0000-000000000003', 'victime@test.local', 'manager', true)$$,
  '42501',
  null,
  'LOT8 R1: rattacher le compte auth d un tiers est refuse (42501)'
);

-- 3. CORRECTION: le serveur ne peut plus supprimer la ligne de son patron.
select throws_ok(
  $$delete from public.admin_users where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'LOT8 R1: DELETE direct dans admin_users refuse au role authenticated (42501)'
);

-- 4. NON-REGRESSION: les colonnes de la liste blanche restent inscriptibles sur
--    une ligne vivante de son tenant (GRANT UPDATE(colonne) conserve + nouvelle
--    policy FOR UPDATE avec WITH CHECK).
update public.admin_users
  set full_name = 'Nom mis a jour'
  where id = 'cccccccc-0000-0000-0000-000000000002';
select is(
  (select full_name from public.admin_users where id = 'cccccccc-0000-0000-0000-000000000002'),
  'Nom mis a jour',
  'LOT8 non-regression: UPDATE d une colonne de la liste blanche passe toujours'
);

-- 5. CORRECTION: une ligne retiree par la PLATEFORME n est plus reactivable par
--    le tenant. Sans cela, la remediation d une ligne parasite (soft-delete
--    depuis la console super-admin) etait annulable en une requete, et le gel du
--    proprietaire legitime revenait indefiniment.
--    Une policy RESTRICTIVE ne leve pas d erreur: elle ne fait correspondre
--    aucune ligne. On mesure donc l etat APRES.
--    On ecrit `full_name` et non `is_active`: depuis la section 4 de la
--    migration, `is_active` n est plus inscriptible du tout par un role client
--    (cas 7), donc l ecrire ici leverait un 42501 et mesurerait le privilege au
--    lieu de la policy. C est bien la POLICY qu on veut eprouver ici.
update public.admin_users
  set full_name = 'Reactivee par le tenant'
  where id = 'cccccccc-0000-0000-0000-000000000003';
select is(
  (select full_name from public.admin_users where id = 'cccccccc-0000-0000-0000-000000000003'),
  null,
  'LOT8 R1: une ligne retiree par la plateforme n est pas modifiable par le tenant'
);

-- 6. CORRECTION (section 4 de la migration): `is_active` est une colonne de
--    PRIVILEGE, retiree de la liste blanche cliente. Sans ce revoke, un serveur
--    desactivait le PROPRIETAIRE de son restaurant - ou reactivait un collegue
--    que le patron venait de desactiver. On l eprouve sur SA PROPRE ligne, le
--    cas le plus favorable a l appelant: meme la, c est refuse.
select throws_ok(
  $$update public.admin_users set is_active = false
      where id = 'cccccccc-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'LOT8: UPDATE de is_active refuse au role authenticated, meme sur sa propre ligne (42501)'
);

-- 7. CORRECTION (section 4): la policy UPDATE est passee de "mon tenant" a "MA
--    ligne". Un membre n a aucune raison d ecrire dans la fiche d un collegue;
--    la gestion d equipe passe par service_role. Une policy ne leve pas
--    d erreur: elle ne fait correspondre aucune ligne, on mesure donc l etat.
update public.admin_users
  set full_name = 'Renomme par un collegue'
  where id = 'cccccccc-0000-0000-0000-000000000001';
select is(
  (select full_name from public.admin_users where id = 'cccccccc-0000-0000-0000-000000000001'),
  null,
  'LOT8: un membre ne peut pas modifier la ligne d un collegue de son tenant'
);

select * from finish();
rollback;
