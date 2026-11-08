-- Un titulaire de compte ne peut pas s'abonner aux commandes d'un AUTRE restaurant.
--
-- CE QUE CE TEST VERROUILLE. Avant le 2026-11-08, la policy d'ecriture de
-- `push_subscriptions` ne contraignait que `user_id`:
--
--   with check (user_id = (select auth.uid()))
--
-- Elle ne regardait jamais `tenant_id`. La cle anon etant dans le bundle du
-- navigateur, un utilisateur authentifie pouvait ecrire directement dans
-- PostgREST une ligne portant le `tenant_id` d'un concurrent et son propre
-- appareil - et recevoir ensuite, a chaque commande de ce restaurant, le numero
-- de table, le nombre d'articles et le montant.
--
-- Aucun test applicatif ne peut prouver ceci: le defaut n'est pas dans le code
-- de l'application, qui derive correctement le tenant de la session. Il est dans
-- la base, sur un chemin qui contourne l'application.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/push_subscriptions_appartenance.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

-- Deux restaurants, deux comptes: un membre legitime, et l'attaquant.
insert into public.tenants (id, slug, name, is_active, currency, subscription_status) values
  ('cccc1111-0000-0000-0000-00000000000a', 'push-victime', 'Resto Victime', true, 'XOF', 'active'),
  ('cccc2222-0000-0000-0000-00000000000b', 'push-attaquant', 'Resto Attaquant', true, 'XOF', 'active');

insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('dddd1111-0000-0000-0000-00000000000a', 'eeee1111-0000-0000-0000-00000000000a',
   'cccc1111-0000-0000-0000-00000000000a', 'membre@exemple.test', 'owner', true),
  ('dddd2222-0000-0000-0000-00000000000b', 'eeee2222-0000-0000-0000-00000000000b',
   'cccc2222-0000-0000-0000-00000000000b', 'attaquant@exemple.test', 'owner', true);

-- ===========================================================================
-- La policy existe et contraint bien le restaurant
-- ===========================================================================
select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.push_subscriptions'::regclass),
  1,
  'une seule policy sur push_subscriptions: pas de reste permissif');

select ok(
  (select pg_get_expr(polwithcheck, polrelid) from pg_policy
    where polrelid = 'public.push_subscriptions'::regclass) like '%get_my_tenant_ids%',
  'le with check exige l appartenance au restaurant, pas seulement l utilisateur');

select ok(
  (select pg_get_expr(polqual, polrelid) from pg_policy
    where polrelid = 'public.push_subscriptions'::regclass) like '%get_my_tenant_ids%',
  'le using aussi: on ne lit pas les appareils d un autre restaurant');

-- ===========================================================================
-- Les droits de table: la RLS ne protege pas TRUNCATE
-- ===========================================================================
select is(
  has_table_privilege('authenticated', 'public.push_subscriptions', 'truncate'),
  false,
  'authenticated ne peut plus vider la table de tous les restaurants');

select is(
  has_table_privilege('authenticated', 'public.push_subscriptions', 'insert'),
  true,
  'non-regression: un membre peut toujours enregistrer son appareil');

select is(
  has_table_privilege('anon', 'public.push_subscriptions', 'select'),
  false,
  'non-regression: un anonyme ne lit toujours pas les identifiants d appareils');

-- ===========================================================================
-- Le comportement, pas seulement la forme de la policy
-- ===========================================================================
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"eeee2222-0000-0000-0000-00000000000b","role":"authenticated"}';

-- L'attaquant tente d'inserer sous le tenant de la victime, avec SON user_id.
select throws_ok(
  $$insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values ('cccc1111-0000-0000-0000-00000000000a', 'eeee2222-0000-0000-0000-00000000000b',
            'https://fcm.googleapis.com/fcm/send/attaquant', 'p', 'a')$$,
  '42501',
  NULL,
  'l insertion sous le restaurant d un autre est refusee par la RLS');

-- Et sous SON restaurant, elle passe: la garde n'a pas casse le cas legitime.
select lives_ok(
  $$insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth)
    values ('cccc2222-0000-0000-0000-00000000000b', 'eeee2222-0000-0000-0000-00000000000b',
            'https://fcm.googleapis.com/fcm/send/legitime', 'p', 'a')$$,
  'un membre enregistre son appareil sous son propre restaurant');

reset role;
select * from finish();
rollback;
