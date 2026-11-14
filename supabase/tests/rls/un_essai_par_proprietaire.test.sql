-- P-05: un seul essai gratuit par proprietaire (migration 20261114120000).
--
-- Temoin negatif: avant la migration, les cas 3, 4 et 6 echouent (chaque nouveau
-- tenant recevait `trial` + 14 jours, quel que soit le proprietaire).
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/un_essai_par_proprietaire.test.sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('e1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'Fatou+essai@Test.local', 'x', now(), now()),
  ('e2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'amadou@test.local', 'x', now(), now()),
  ('e3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'fatou@test.local', 'x', now(), now()),
  ('e4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'nouveau@test.local', 'x', now(), now());

-- 1. Premier etablissement de Fatou: essai normal.
select lives_ok(
  $$select provision_signup_tenant('essai-un', 'Essai Un', 'starter',
      'e1111111-1111-4111-8111-111111111111', 'Fatou+essai@Test.local', 'Fatou', null)$$,
  'inscription: premier essai accorde');

select is(
  (select subscription_status from tenants where slug = 'essai-un'), 'trial',
  'inscription: premier etablissement en essai');

-- 2. Deuxieme etablissement pendant l'essai: meme date de fin.
select lives_ok(
  $$select provision_group_restaurant(
      (select id from restaurant_groups where owner_user_id = 'e1111111-1111-4111-8111-111111111111'),
      'e1111111-1111-4111-8111-111111111111', 'Fatou+essai@Test.local',
      'Essai Deux', 'essai-deux', 'restaurant', 'trial')$$,
  'ajout pendant l essai: cree');

select is(
  (select trial_ends_at from tenants where slug = 'essai-deux'),
  (select trial_ends_at from tenants where slug = 'essai-un'),
  'ajout pendant l essai: MEME date de fin (pas 14 jours neufs)');

select is(
  (select subscription_status from tenants where slug = 'essai-deux'), 'trial',
  'ajout pendant l essai: statut trial');

-- 3. Essai fini: le troisieme etablissement n'a pas d'essai.
update tenants set trial_ends_at = now() - interval '2 days'
 where slug in ('essai-un', 'essai-deux');

select lives_ok(
  $$select provision_group_restaurant(
      (select id from restaurant_groups where owner_user_id = 'e1111111-1111-4111-8111-111111111111'),
      'e1111111-1111-4111-8111-111111111111', 'Fatou+essai@Test.local',
      'Essai Trois', 'essai-trois', 'restaurant', 'trial')$$,
  'ajout apres essai fini: cree');

select is(
  (select subscription_status || '/' || is_active::text || '/' || freeze_reason
     from tenants where slug = 'essai-trois'),
  'frozen/false/trial_expired',
  'ajout apres essai fini: gele, inactif, cause trial_expired (pas de nouvel essai)');

-- 4. Proprietaire deja abonne: un nouvel etablissement n'a pas d'essai non plus.
insert into restaurant_groups (owner_user_id, name)
values ('e2222222-2222-4222-8222-222222222222', 'Groupe Amadou');
insert into tenants (slug, name, group_id, subscription_status, subscription_plan, is_active)
select 'amadou-paye', 'Amadou Paye', id, 'active', 'pro', true
  from restaurant_groups where owner_user_id = 'e2222222-2222-4222-8222-222222222222';

select lives_ok(
  $$select provision_group_restaurant(
      (select id from restaurant_groups where owner_user_id = 'e2222222-2222-4222-8222-222222222222'),
      'e2222222-2222-4222-8222-222222222222', 'amadou@test.local',
      'Amadou Deux', 'amadou-deux', 'restaurant', 'trial')$$,
  'proprietaire abonne: ajout cree');

select is(
  (select subscription_status from tenants where slug = 'amadou-deux'), 'frozen',
  'proprietaire abonne: le nouvel etablissement doit avoir sa propre souscription');

-- 5. Suppression du compte puis reinscription avec un alias du meme e-mail.
delete from admin_users where tenant_id in (select id from tenants where slug in ('essai-un','essai-deux','essai-trois'));
delete from tenants where slug in ('essai-un', 'essai-deux', 'essai-trois');
delete from restaurant_groups where owner_user_id = 'e1111111-1111-4111-8111-111111111111';

select is(
  (select count(*)::int from owner_trial_ledger
    where email_key = normalize_owner_email('fatou@test.local')), 1,
  'le registre survit a la suppression (cle = e-mail normalise, alias +essai retire)');

select lives_ok(
  $$select provision_signup_tenant('essai-retour', 'Essai Retour', 'starter',
      'e3333333-3333-4333-8333-333333333333', 'FATOU@test.local', 'Fatou', null)$$,
  'reinscription: creee');

select is(
  (select subscription_status from tenants where slug = 'essai-retour'), 'frozen',
  'reinscription avec le meme e-mail: pas de nouvel essai');

-- 6. Temoin positif: un proprietaire jamais vu garde son essai de 14 jours.
select lives_ok(
  $$select provision_signup_tenant('essai-nouveau', 'Essai Nouveau', 'starter',
      'e4444444-4444-4444-8444-444444444444', 'nouveau@test.local', 'Nouveau', null)$$,
  'nouveau proprietaire: cree');

select is(
  (select subscription_status || '/' || (trial_ends_at > now() + interval '13 days')::text
     from tenants where slug = 'essai-nouveau'),
  'trial/true',
  'temoin positif: un proprietaire jamais vu garde ses 14 jours');

select * from finish();
rollback;
