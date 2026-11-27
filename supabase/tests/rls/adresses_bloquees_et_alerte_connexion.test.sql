-- Audits R8 (C4) et Q19 (C12): deux tables de la plateforme, fermees a l'API.
--
-- CE QUE CE TEST VERROUILLE (migrations 20261124210400 et 20261124210500):
--   1. `adresses_email_bloquees`: RLS active, aucune politique, aucun privilege
--      pour anon ni authenticated; une lecture par un compte est refusee.
--   2. `alertes_nouvelle_connexion`: idem.
--   3. `reserver_alerte_nouvelle_connexion()`: refusee a anon, rend true a la
--      premiere reservation d'un compte puis false dans l'heure (plafond), et
--      ne reserve que pour le compte appelant.
--
-- Execution: scripts/run-pgtap.sh --local

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('a1900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alerte-a@exemple.test', 'x', now(), now()),
  ('a1900000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alerte-b@exemple.test', 'x', now(), now());

select ok(
  (select relrowsecurity from pg_class where oid = 'public.adresses_email_bloquees'::regclass),
  'RLS active sur adresses_email_bloquees');
select is(
  (select count(*)::int from pg_policy where polrelid = 'public.adresses_email_bloquees'::regclass),
  0, 'aucune politique sur adresses_email_bloquees');
select ok(
  not has_table_privilege('anon', 'public.adresses_email_bloquees', 'SELECT')
  and not has_table_privilege('authenticated', 'public.adresses_email_bloquees', 'SELECT')
  and not has_table_privilege('authenticated', 'public.adresses_email_bloquees', 'INSERT'),
  'anon et authenticated n ont aucun privilege sur adresses_email_bloquees');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.alertes_nouvelle_connexion'::regclass),
  'RLS active sur alertes_nouvelle_connexion');
select ok(
  not has_table_privilege('authenticated', 'public.alertes_nouvelle_connexion', 'SELECT')
  and not has_table_privilege('authenticated', 'public.alertes_nouvelle_connexion', 'UPDATE'),
  'authenticated ne lit ni n ecrit alertes_nouvelle_connexion');
select ok(
  not has_function_privilege('anon', 'public.reserver_alerte_nouvelle_connexion()', 'EXECUTE'),
  'anon ne peut pas reserver d alerte');
select ok(
  coalesce(
    (select proconfig from pg_proc
      where oid = 'public.reserver_alerte_nouvelle_connexion()'::regprocedure)
      @> array['search_path=""'],
    false),
  'reserver_alerte_nouvelle_connexion epingle son search_path a vide');

-- Une empreinte invalide (adresse en clair) est refusee par la contrainte.
select throws_ok(
  $$insert into public.adresses_email_bloquees (email_hash, raison)
    values ('gerant@exemple.test', 'plainte')$$,
  '23514', NULL,
  'une adresse en clair ne peut pas etre stockee a la place de l empreinte');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"a1900000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$select count(*) from public.adresses_email_bloquees$$,
  '42501', NULL,
  'un compte connecte ne lit pas la liste des adresses bloquees');

select is(public.reserver_alerte_nouvelle_connexion(), false,
  'toute premiere connexion depuis la mise en service: enregistree sans alerte');
select is(public.reserver_alerte_nouvelle_connexion(), true,
  'connexion suivante depuis un appareil inconnu: alerte reservee');
select is(public.reserver_alerte_nouvelle_connexion(), false,
  'seconde alerte dans l heure: refusee (plafond)');

-- Un autre compte garde son propre droit: la reservation ne vaut que pour l'appelant.
set local "request.jwt.claims" = '{"sub":"a1900000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is(public.reserver_alerte_nouvelle_connexion(), false,
  'autre compte: sa premiere connexion est un amorcage, pas une alerte');
select is(public.reserver_alerte_nouvelle_connexion(), true,
  'le plafond d un compte ne touche pas un autre compte');

-- Temoin du plafond: une heure plus tard, le compte A peut de nouveau etre alerte.
reset role;
update public.alertes_nouvelle_connexion
   set derniere_alerte_at = now() - interval '61 minutes'
 where user_id = 'a1900000-0000-0000-0000-00000000000a';
set local role authenticated;
set local "request.jwt.claims" = '{"sub":"a1900000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(public.reserver_alerte_nouvelle_connexion(), true,
  'plus d une heure apres: nouvelle alerte reservee');

reset role;

select * from finish();
rollback;
