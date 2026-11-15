-- Conservation des donnees personnelles: les deux fonctions de la migration
-- 20261115110000_retention_purges.
--
-- CE QUE CE TEST VERROUILLE.
--   1. Privileges: ni anon ni authenticated ne peuvent les executer (sinon
--      n'importe qui pourrait effacer les donnees d'un restaurant clos), ni lire
--      la colonne `tenants.anonymized_at`. service_role seul les execute.
--   2. Comportement, avec un temoin POSITIF (un restaurant clos depuis 40 jours
--      est anonymise) ET des temoins NEGATIFS (clos depuis 10 jours, ou toujours
--      actif: rien n'est touche; un membre qui appartient aussi a un restaurant
--      vivant n'est pas retourne pour l'effacement de son compte).
--   3. Les commandes et les paiements ne sont jamais references par les fonctions.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/retention_purges.test.sql

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

-- ---------------------------------------------------------------------------
-- 1. Privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.anonymize_closed_tenants(timestamptz)', 'EXECUTE'),
  'anon ne peut pas executer anonymize_closed_tenants');
select ok(
  not has_function_privilege('authenticated', 'public.anonymize_closed_tenants(timestamptz)', 'EXECUTE'),
  'authenticated ne peut pas executer anonymize_closed_tenants');
select ok(
  has_function_privilege('service_role', 'public.anonymize_closed_tenants(timestamptz)', 'EXECUTE'),
  'service_role peut executer anonymize_closed_tenants');
select ok(
  not has_function_privilege('anon', 'public.closed_tenant_auth_users(timestamptz)', 'EXECUTE'),
  'anon ne peut pas executer closed_tenant_auth_users');
select ok(
  not has_function_privilege('authenticated', 'public.closed_tenant_auth_users(timestamptz)', 'EXECUTE'),
  'authenticated ne peut pas executer closed_tenant_auth_users');
select ok(
  has_function_privilege('service_role', 'public.closed_tenant_auth_users(timestamptz)', 'EXECUTE'),
  'service_role peut executer closed_tenant_auth_users');
select ok(
  not has_column_privilege('anon', 'public.tenants', 'anonymized_at', 'SELECT'),
  'anon ne lit pas tenants.anonymized_at');
select ok(
  not has_column_privilege('authenticated', 'public.tenants', 'anonymized_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.tenants', 'anonymized_at', 'UPDATE'),
  'authenticated ne lit ni n ecrit tenants.anonymized_at');
select ok(
  (select bool_and(prosecdef and proconfig @> array['search_path=""'])
     from pg_proc
    where oid in ('public.anonymize_closed_tenants(timestamptz)'::regprocedure,
                  'public.closed_tenant_auth_users(timestamptz)'::regprocedure)),
  'les deux fonctions sont SECURITY DEFINER au search_path epingle');
select ok(
  (select bool_and(prosrc !~* '(payments|orders|stripe_events)')
     from pg_proc
    where oid in ('public.anonymize_closed_tenants(timestamptz)'::regprocedure,
                  'public.closed_tenant_auth_users(timestamptz)'::regprocedure)),
  'aucune des deux fonctions ne reference payments, orders ni stripe_events');

-- ---------------------------------------------------------------------------
-- 2. Comportement
-- Restaurants: A clos depuis 40 jours (du), B clos depuis 10 jours (en delai),
-- C actif.
-- ---------------------------------------------------------------------------
insert into public.tenants (id, slug, name, is_active, currency, subscription_status, phone, address, deleted_at) values
  ('cccc0001-0000-0000-0000-00000000000a', 'purge-a', 'Resto A', false, 'XOF', 'active', '+22670000001', 'Rue A', now() - interval '40 days'),
  ('cccc0002-0000-0000-0000-00000000000b', 'purge-b', 'Resto B', false, 'XOF', 'active', '+22670000002', 'Rue B', now() - interval '10 days'),
  ('cccc0003-0000-0000-0000-00000000000c', 'purge-c', 'Resto C', true,  'XOF', 'active', '+22670000003', 'Rue C', null);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at) values
  ('eeee0001-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seul-a@exemple.test', 'x', now(), now()),
  ('eeee0002-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a-et-c@exemple.test', 'x', now(), now()),
  ('eeee0003-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seul-b@exemple.test', 'x', now(), now());

insert into public.admin_users (id, user_id, tenant_id, email, full_name, phone, role, is_active) values
  ('dddd0001-0000-0000-0000-00000000000a', 'eeee0001-0000-0000-0000-00000000000a', 'cccc0001-0000-0000-0000-00000000000a', 'seul-a@exemple.test', 'Seul A', '+22671000001', 'owner', true),
  ('dddd0002-0000-0000-0000-00000000000b', 'eeee0002-0000-0000-0000-00000000000b', 'cccc0001-0000-0000-0000-00000000000a', 'a-et-c@exemple.test', 'A et C', '+22671000002', 'manager', true),
  ('dddd0003-0000-0000-0000-00000000000c', 'eeee0002-0000-0000-0000-00000000000b', 'cccc0003-0000-0000-0000-00000000000c', 'a-et-c@exemple.test', 'A et C', '+22671000002', 'manager', true),
  ('dddd0004-0000-0000-0000-00000000000d', 'eeee0003-0000-0000-0000-00000000000c', 'cccc0002-0000-0000-0000-00000000000b', 'seul-b@exemple.test', 'Seul B', '+22671000003', 'owner', true);

insert into public.invitations (tenant_id, email, role, invited_by, token, expires_at) values
  ('cccc0001-0000-0000-0000-00000000000a', 'inv-a@exemple.test', 'waiter', 'dddd0001-0000-0000-0000-00000000000a', 'tok-purge-a', now() + interval '1 day'),
  ('cccc0002-0000-0000-0000-00000000000b', 'inv-b@exemple.test', 'waiter', 'dddd0004-0000-0000-0000-00000000000d', 'tok-purge-b', now() + interval '1 day');

insert into public.push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth) values
  ('cccc0001-0000-0000-0000-00000000000a', 'eeee0001-0000-0000-0000-00000000000a', 'https://fcm.googleapis.com/a', 'p', 'a'),
  ('cccc0002-0000-0000-0000-00000000000b', 'eeee0003-0000-0000-0000-00000000000c', 'https://fcm.googleapis.com/b', 'p', 'a');

insert into public.audit_log (tenant_id, user_email, action, entity_type) values
  ('cccc0001-0000-0000-0000-00000000000a', 'seul-a@exemple.test', 'update', 'setting'),
  ('cccc0002-0000-0000-0000-00000000000b', 'seul-b@exemple.test', 'update', 'setting');

select is(
  (select array_agg(auth_user_id order by auth_user_id)
     from public.closed_tenant_auth_users(now() - interval '30 days')),
  array['eeee0001-0000-0000-0000-00000000000a']::uuid[],
  'seul le membre du restaurant clos depuis 40 jours est retourne pour l effacement du compte');

select is(
  (select count(*)::int from public.closed_tenant_auth_users(now() - interval '30 days')
    where auth_user_id = 'eeee0002-0000-0000-0000-00000000000b'),
  0,
  'un membre qui appartient aussi a un restaurant vivant n est PAS retourne');

select is(
  (select count(*)::int from public.closed_tenant_auth_users(now() - interval '30 days')
    where auth_user_id = 'eeee0003-0000-0000-0000-00000000000c'),
  0,
  'un membre d un restaurant clos depuis 10 jours (en delai) n est PAS retourne');

insert into public.house_accounts (id, tenant_id, name, description) values
  ('aaaa0001-0000-0000-0000-00000000000a', 'cccc0001-0000-0000-0000-00000000000a', 'M. Dupont', 'Client du vendredi'),
  ('aaaa0002-0000-0000-0000-00000000000b', 'cccc0002-0000-0000-0000-00000000000b', 'Mme Traore', 'Fidele');

insert into public.orders (tenant_id, house_account_id, order_number, subtotal, total, status) values
  ('cccc0001-0000-0000-0000-00000000000a', 'aaaa0001-0000-0000-0000-00000000000a', 'RET-0001', 12500, 12500, 'served');

select is(
  public.anonymize_closed_tenants(now() - interval '30 days'),
  1,
  'un seul restaurant est anonymise: celui clos depuis 40 jours');

select is(
  (select count(*)::int from public.admin_users
    where tenant_id = 'cccc0001-0000-0000-0000-00000000000a'
      and email like 'anonymise-%@anonymise.invalid'
      and full_name is null and phone is null and is_active = false),
  2,
  'les deux membres du restaurant A sont anonymises (adresse, nom, telephone effaces)');

select is(
  (select count(*)::int from public.admin_users
    where tenant_id in ('cccc0002-0000-0000-0000-00000000000b', 'cccc0003-0000-0000-0000-00000000000c')
      and email in ('seul-b@exemple.test', 'a-et-c@exemple.test')
      and full_name is not null and phone is not null),
  2,
  'les membres du restaurant en delai et du restaurant actif sont intacts');

select is(
  (select count(*)::int from public.invitations where tenant_id = 'cccc0001-0000-0000-0000-00000000000a'),
  0, 'les invitations du restaurant A sont supprimees');
select is(
  (select count(*)::int from public.invitations where tenant_id = 'cccc0002-0000-0000-0000-00000000000b'),
  1, 'les invitations du restaurant en delai sont conservees');

select is(
  (select count(*)::int from public.push_subscriptions where tenant_id = 'cccc0001-0000-0000-0000-00000000000a'),
  0, 'les abonnements push du restaurant A sont supprimes');
select is(
  (select count(*)::int from public.push_subscriptions where tenant_id = 'cccc0002-0000-0000-0000-00000000000b'),
  1, 'les abonnements push du restaurant en delai sont conserves');

select is(
  (select count(*)::int from public.audit_log
    where tenant_id = 'cccc0001-0000-0000-0000-00000000000a' and user_email is null),
  1, 'la ligne d audit du restaurant A reste mais sans adresse e-mail');
select is(
  (select user_email from public.audit_log where tenant_id = 'cccc0002-0000-0000-0000-00000000000b'),
  'seul-b@exemple.test', 'la ligne d audit du restaurant en delai garde son adresse');

select ok(
  (select phone is null and address is null and anonymized_at is not null
     from public.tenants where id = 'cccc0001-0000-0000-0000-00000000000a'),
  'le restaurant A perd telephone et adresse et porte la date d anonymisation');

select is(
  (select phone || '|' || address from public.tenants where id = 'cccc0002-0000-0000-0000-00000000000b'),
  '+22670000002|Rue B', 'le restaurant en delai garde telephone et adresse');

select ok(
  (select name = 'Compte anonymise' and description is null
     from public.house_accounts where id = 'aaaa0001-0000-0000-0000-00000000000a'),
  'le compte client a credit du restaurant A est anonymise (nom, description)');

select is(
  (select name || '|' || description from public.house_accounts
    where id = 'aaaa0002-0000-0000-0000-00000000000b'),
  'Mme Traore|Fidele',
  'le compte client a credit du restaurant en delai est intact');

select is(
  (select sum(total)::bigint from public.orders
    where house_account_id = 'aaaa0001-0000-0000-0000-00000000000a'),
  12500::bigint,
  'le solde du compte client (commandes rattachees) est intact');

select is(
  public.anonymize_closed_tenants(now() - interval '30 days'),
  0,
  'idempotent: un second passage n anonymise plus rien');

select * from finish();
rollback;
