-- P-05: un seul essai gratuit par proprietaire (migration 20261114120000).
--
-- Temoin negatif: ces assertions decrivent un comportement que le code d'AVANT
-- la migration n'avait pas (chaque nouveau tenant recevait trial + 14 jours, la
-- fonction decide_owner_trial et le registre n'existaient pas). Aucune mesure
-- n'a ete faite sur le banc a la date de redaction: a executer avant fusion,
-- puis, comme temoin, a rejouer sans la migration (les cas d'ajout apres essai,
-- de proprietaire abonne et de reinscription doivent alors echouer).
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/un_essai_par_proprietaire.test.sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values
  ('e1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fatou@test.local', 'x', now(), now(), now()),
  ('e2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'amadou@test.local', 'x', now(), now(), now()),
  ('e3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', 'x', now(), now(), now()),
  ('e4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nouveau@test.local', 'x', now(), now(), now()),
  ('e5555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's@test.local', 'x', now(), now(), null),
  ('e6666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x@test.local', 'x', now(), now(), now()),
  ('e7777777-7777-4777-8777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'l@test.local', 'x', now(), now(), null),
  ('e8888888-8888-4888-8888-888888888888', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'attaquant@test.local', 'x', now(), now(), now());

-- 1. Premier etablissement de Fatou: essai normal.
select lives_ok($$select provision_signup_tenant('essai-un', 'essai-un', 'starter', 'e1111111-1111-4111-8111-111111111111', 'x@x.local', 'N', null)$$, 'inscription: premier essai accorde');
select is((select subscription_status from tenants where slug = 'essai-un'), 'trial', 'inscription: premier etablissement en essai');

-- 2. Ajout pendant l'essai: meme date de fin.
select lives_ok(
  $$select provision_group_restaurant(
      (select id from restaurant_groups where owner_user_id = 'e1111111-1111-4111-8111-111111111111'),
      'e1111111-1111-4111-8111-111111111111', 'fatou@test.local', 'Essai Deux', 'essai-deux', 'restaurant', 'trial')$$,
  'ajout pendant l essai: cree');
select is((select trial_ends_at from tenants where slug = 'essai-deux'), (select trial_ends_at from tenants where slug = 'essai-un'),
  'ajout pendant l essai: MEME date de fin');

-- 3. Essai fini: pas de nouvel essai.
update tenants set trial_ends_at = now() - interval '2 days' where slug in ('essai-un', 'essai-deux');
select lives_ok(
  $$select provision_group_restaurant(
      (select id from restaurant_groups where owner_user_id = 'e1111111-1111-4111-8111-111111111111'),
      'e1111111-1111-4111-8111-111111111111', 'fatou@test.local', 'Essai Trois', 'essai-trois', 'restaurant', 'trial')$$,
  'ajout apres essai fini: cree');
select is((select subscription_status || '/' || is_active::text || '/' || freeze_reason from tenants where slug = 'essai-trois'),
  'frozen/false/trial_expired', 'ajout apres essai fini: gele, inactif, cause trial_expired');

-- 4. Proprietaire deja abonne.
insert into restaurant_groups (owner_user_id, name) values ('e2222222-2222-4222-8222-222222222222', 'Groupe Amadou');
insert into tenants (slug, name, group_id, subscription_status, subscription_plan, is_active)
select 'amadou-paye', 'Amadou Paye', id, 'active', 'pro', true from restaurant_groups where owner_user_id = 'e2222222-2222-4222-8222-222222222222';
select lives_ok(
  $$select provision_group_restaurant(
      (select id from restaurant_groups where owner_user_id = 'e2222222-2222-4222-8222-222222222222'),
      'e2222222-2222-4222-8222-222222222222', 'amadou@test.local', 'Amadou Deux', 'amadou-deux', 'restaurant', 'trial')$$,
  'proprietaire abonne: ajout cree');
select is((select subscription_status from tenants where slug = 'amadou-deux'), 'frozen', 'proprietaire abonne: pas d essai');

-- 5. Droits d'execution (B1): anon et authenticated ne peuvent rien appeler.
select is(has_function_privilege('anon', 'public.decide_owner_trial(uuid)', 'EXECUTE'), false, 'public.decide_owner_trial(uuid): anon ne peut pas executer');
select is(has_function_privilege('authenticated', 'public.decide_owner_trial(uuid)', 'EXECUTE'), false, 'public.decide_owner_trial(uuid): authenticated ne peut pas executer');
select is(has_function_privilege('anon', 'public.owner_trial_ledger_sync_confirmation()', 'EXECUTE'), false, 'public.owner_trial_ledger_sync_confirmation(): anon ne peut pas executer');
select is(has_function_privilege('authenticated', 'public.owner_trial_ledger_sync_confirmation()', 'EXECUTE'), false, 'public.owner_trial_ledger_sync_confirmation(): authenticated ne peut pas executer');
select is(has_function_privilege('anon', 'public.provision_signup_tenant(text,text,text,uuid,text,text,text)', 'EXECUTE'), false, 'public.provision_signup_tenant(text,text,text,uuid,text,text,text): anon ne peut pas executer');
select is(has_function_privilege('authenticated', 'public.provision_signup_tenant(text,text,text,uuid,text,text,text)', 'EXECUTE'), false, 'public.provision_signup_tenant(text,text,text,uuid,text,text,text): authenticated ne peut pas executer');
select is(has_function_privilege('anon', 'public.provision_group_restaurant(uuid,uuid,text,text,text,text,text)', 'EXECUTE'), false, 'public.provision_group_restaurant(uuid,uuid,text,text,text,text,text): anon ne peut pas executer');
select is(has_function_privilege('authenticated', 'public.provision_group_restaurant(uuid,uuid,text,text,text,text,text)', 'EXECUTE'), false, 'public.provision_group_restaurant(uuid,uuid,text,text,text,text,text): authenticated ne peut pas executer');
select is(has_function_privilege('service_role', 'public.decide_owner_trial(uuid)', 'EXECUTE'), true, 'decide_owner_trial: service_role peut executer');

-- 6. Compte confirme supprime pendant l'essai, reinscription (M2): fin partagee.
select lives_ok($$select provision_signup_tenant('c-un', 'c-un', 'starter', 'e3333333-3333-4333-8333-333333333333', 'x@x.local', 'N', null)$$, 'confirme: premier essai');
delete from admin_users where user_id = 'e3333333-3333-4333-8333-333333333333';
delete from tenants where group_id in (select id from restaurant_groups where owner_user_id = 'e3333333-3333-4333-8333-333333333333');
delete from restaurant_groups where owner_user_id = 'e3333333-3333-4333-8333-333333333333';
delete from auth.users where id = 'e3333333-3333-4333-8333-333333333333';
select is((select (confirmed_at is not null) from owner_trial_ledger where email_key = 'c@test.local'), true,
  'confirme puis supprime: la ligne du registre compte');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values ('ec000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', 'x', now(), now(), now());
select lives_ok($$select provision_signup_tenant('c-deux', 'c-deux', 'starter', 'ec000000-0000-4000-8000-000000000001', 'x@x.local', 'N', null)$$, 'reinscription pendant la fenetre: creee');
select is((select trial_ends_at from tenants where slug = 'c-deux'), (select trial_ends_at from owner_trial_ledger where email_key = 'c@test.local'),
  'reinscription pendant la fenetre: MEME date de fin que le registre (pas 14 jours neufs)');

-- 7. Fenetre expiree puis reinscription: pas d'essai.
update owner_trial_ledger set trial_ends_at = now() - interval '1 day' where email_key = 'c@test.local';
delete from admin_users where user_id = 'ec000000-0000-4000-8000-000000000001';
delete from tenants where group_id in (select id from restaurant_groups where owner_user_id = 'ec000000-0000-4000-8000-000000000001');
delete from restaurant_groups where owner_user_id = 'ec000000-0000-4000-8000-000000000001';
delete from auth.users where id = 'ec000000-0000-4000-8000-000000000001';
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values ('ec000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', 'x', now(), now(), now());
select lives_ok($$select provision_signup_tenant('c-trois', 'c-trois', 'starter', 'ec000000-0000-4000-8000-000000000002', 'x@x.local', 'N', null)$$, 'reinscription apres la fenetre: creee');
select is((select subscription_status from tenants where slug = 'c-trois'), 'frozen', 'reinscription apres la fenetre: pas d essai');

-- 8. Squatteur jamais confirme, supprime: ne bloque pas le vrai proprietaire (M1).
select lives_ok($$select provision_signup_tenant('squat', 'squat', 'starter', 'e5555555-5555-4555-8555-555555555555', 'x@x.local', 'N', null)$$, 'squatteur: essai cree');
select is((select confirmed_at is null from owner_trial_ledger where email_key = 's@test.local'), true, 'squatteur: ligne non confirmee');
delete from admin_users where user_id = 'e5555555-5555-4555-8555-555555555555';
delete from tenants where group_id in (select id from restaurant_groups where owner_user_id = 'e5555555-5555-4555-8555-555555555555');
delete from restaurant_groups where owner_user_id = 'e5555555-5555-4555-8555-555555555555';
delete from auth.users where id = 'e5555555-5555-4555-8555-555555555555';
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
values ('ec000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's@test.local', 'x', now(), now(), now());
select lives_ok($$select provision_signup_tenant('vrai', 'vrai', 'starter', 'ec000000-0000-4000-8000-000000000003', 'x@x.local', 'N', null)$$, 'vrai proprietaire: cree');
select is((select subscription_status || '/' || (trial_ends_at > now() + interval '13 days')::text from tenants where slug = 'vrai'), 'trial/true',
  'squatteur supprime: le vrai proprietaire a ses 14 jours entiers');

-- 9. Alias +x non fusionne (cle = e-mail exact).
select lives_ok($$select provision_signup_tenant('x-un', 'x-un', 'starter', 'e6666666-6666-4666-8666-666666666666', 'x@x.local', 'N', null)$$, 'x: essai cree');
select is((select count(*)::int from owner_trial_ledger where email_key in ('x@test.local', 'x+1@test.local')), 1, 'cle exacte: pas de fusion silencieuse des alias');

-- 10. Confirmation tardive enregistree par le declencheur.
select lives_ok($$select provision_signup_tenant('l-un', 'l-un', 'starter', 'e7777777-7777-4777-8777-777777777777', 'x@x.local', 'N', null)$$, 'tardif: essai cree');
update auth.users set email_confirmed_at = now() where id = 'e7777777-7777-4777-8777-777777777777';
select is((select confirmed_at is not null from owner_trial_ledger where email_key = 'l@test.local'), true, 'confirmation tardive: la ligne compte');

-- 11. SEC-1: l'adresse passee en parametre n'alimente pas le registre.
select lives_ok($$select provision_signup_tenant('attaque', 'attaque', 'starter', 'e8888888-8888-4888-8888-888888888888', 'victime@test.local', 'N', null)$$, 'attaquant: cree');
select is((select count(*)::int from owner_trial_ledger where email_key = 'victime@test.local'), 0, 'SEC-1: aucune ligne au nom de la victime');

select * from finish();
rollback;
