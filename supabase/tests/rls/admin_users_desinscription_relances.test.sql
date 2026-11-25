-- R5 / T9 (lot 8) - migration 20261125090000: la desinscription des e-mails de
-- relance (`admin_users.lifecycle_emails_opt_out_at`) n'est inscriptible que
-- par le serveur (service_role, apres verification d'un jeton signe).
--
-- Ce que ce test prouve, et qu'un test Vitest ne peut pas prouver: le refus
-- vient des PRIVILEGES Postgres. Un membre ne peut ni se reabonner une fois
-- desinscrit par le lien, ni desinscrire ou reabonner quelqu'un d'autre.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/admin_users_desinscription_relances.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('dddddddd-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'patron-r5@test.local', 'x', now(), now());

insert into public.tenants (id, slug, name, is_active)
values ('eeeeeeee-0000-0000-0000-000000000001', 'tenant-test-r5', 'Tenant Test R5', true);

insert into public.admin_users (id, tenant_id, user_id, email, role, is_active)
values
  ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001',
   'dddddddd-0000-0000-0000-000000000001', 'patron-r5@test.local', 'owner', true);

-- 1. La colonne existe, nullable: NULL = abonne (valeur par defaut d'une ligne).
select col_is_null('public', 'admin_users', 'lifecycle_emails_opt_out_at',
  'R5: lifecycle_emails_opt_out_at est nullable');
select is(
  (select lifecycle_emails_opt_out_at from public.admin_users
    where id = 'ffffffff-0000-0000-0000-000000000001'),
  null,
  'R5: une ligne neuve est abonnee (NULL)'
);

-- 2. Aucun privilege UPDATE de colonne pour les roles clients.
select ok(
  not has_column_privilege('authenticated', 'public.admin_users',
    'lifecycle_emails_opt_out_at', 'UPDATE')
  and not has_column_privilege('anon', 'public.admin_users',
    'lifecycle_emails_opt_out_at', 'UPDATE'),
  'R5: ni authenticated ni anon ne peuvent ecrire lifecycle_emails_opt_out_at'
);

-- 3. Le service (service_role, contournement du RLS) pose la desinscription.
update public.admin_users
  set lifecycle_emails_opt_out_at = now()
  where id = 'ffffffff-0000-0000-0000-000000000001';

-- 4. Le membre, sur SA PROPRE ligne (le cas le plus favorable), ne peut pas
--    effacer sa desinscription: 42501.
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001"}';

select throws_ok(
  $$update public.admin_users set lifecycle_emails_opt_out_at = null
      where id = 'ffffffff-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'R5: un membre ne peut pas modifier sa desinscription des relances (42501)'
);

reset role;
select isnt(
  (select lifecycle_emails_opt_out_at from public.admin_users
    where id = 'ffffffff-0000-0000-0000-000000000001'),
  null,
  'R5: la desinscription posee par le serveur est conservee'
);

select * from finish();
rollback;
