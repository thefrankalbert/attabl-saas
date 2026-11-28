-- Lot desabonnement: table email_unsubscribes (migration 20261124190000).
--
-- CE QUE CE TEST VERROUILLE:
--   - RLS active, aucune policy: ni anon ni authenticated ne lisent ni
--     n'ecrivent (refus par PRIVILEGE, avant meme RLS);
--   - service_role lit, insere (doublon ignore: idempotent) et supprime, et
--     n'a AUCUN autre droit (ni update, ni truncate...): les privileges par
--     defaut de Supabase les lui donnaient (contre-audit 1, D1);
--   - une adresse non normalisee (majuscules, espaces) est refusee: elle ne
--     serait jamais retrouvee par une lecture normalisee.
--
-- Chaque refus a son temoin positif. Sans la migration, la table n'existe pas
-- et toutes les assertions echouent.
--
-- Execution: scripts/run-pgtap.sh --local (ou --db-url)

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select has_table('public', 'email_unsubscribes', 'la table existe');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.email_unsubscribes'::regclass),
  'RLS active');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'email_unsubscribes'),
  0, 'aucune policy');
select ok(
  not has_table_privilege('anon', 'public.email_unsubscribes', 'select, insert, update, delete'),
  'anon: aucun droit');
select ok(
  not has_table_privilege('authenticated', 'public.email_unsubscribes', 'select, insert, update, delete'),
  'authenticated: aucun droit');
select table_privs_are(
  'public', 'email_unsubscribes', 'service_role', array['SELECT', 'INSERT', 'DELETE'],
  'service_role: select, insert, delete et rien d autre (avant: tous les droits par defaut)');

-- Temoins positifs: service_role ecrit, relit, ignore un doublon, supprime.
set local role service_role;
select lives_ok(
  $$insert into public.email_unsubscribes (email_normalized) values ('patron@lot-desabo.test')$$,
  'service_role insere une adresse normalisee');
select lives_ok(
  $$insert into public.email_unsubscribes (email_normalized) values ('patron@lot-desabo.test')
    on conflict (email_normalized) do nothing$$,
  'doublon ignore (desabonnement idempotent)');
select is(
  (select count(*)::int from public.email_unsubscribes where email_normalized = 'patron@lot-desabo.test'),
  1, 'une seule ligne par adresse');
select throws_ok(
  $$insert into public.email_unsubscribes (email_normalized) values ('Patron@Lot-Desabo.test')$$,
  '23514', null, 'adresse avec majuscules refusee');
select throws_ok(
  $$insert into public.email_unsubscribes (email_normalized) values (' autre@lot-desabo.test')$$,
  '23514', null, 'adresse avec espace refusee');
select lives_ok(
  $$delete from public.email_unsubscribes where email_normalized = 'patron@lot-desabo.test'$$,
  'service_role supprime (reabonnement)');
reset role;

-- Refus effectifs pour les roles clients.
set local role anon;
select throws_ok(
  $$select * from public.email_unsubscribes$$,
  '42501', null, 'anon ne lit pas');
reset role;
set local role authenticated;
select throws_ok(
  $$insert into public.email_unsubscribes (email_normalized) values ('x@lot-desabo.test')$$,
  '42501', null, 'authenticated n ecrit pas');
reset role;

select * from finish();
rollback;
