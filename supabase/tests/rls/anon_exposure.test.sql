-- LOT 1 - surface reellement accessible au role anon.
--
-- Ces assertions sont la traduction en test des fuites verifiees en production le
-- 2026-07-31 (constats DB-01, DB-02, DB-06, DB-07, DB-12). Elles doivent echouer
-- si quelqu'un rouvre un grant ou recree une policy trop large.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/anon_exposure.test.sql

begin;
-- pgTAP est installe dans le schema `extensions`, PAS dans `public`: ses propres
-- tables recevraient sinon les privileges par defaut du schema public et
-- fausseraient l assertion "plus aucun privilege d ecriture pour anon".
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

-- ---------------------------------------------------------------- DB-02 tenants
-- Les colonnes commerciales et de facturation ne doivent plus etre lisibles.
set local role anon;

select throws_ok(
  'select stripe_customer_id from public.tenants limit 1',
  '42501',
  null,
  'DB-02: anon ne peut pas lire tenants.stripe_customer_id'
);
select throws_ok(
  'select stripe_subscription_id from public.tenants limit 1',
  '42501', null,
  'DB-02: anon ne peut pas lire tenants.stripe_subscription_id'
);
select throws_ok(
  'select subscription_status from public.tenants limit 1',
  '42501', null,
  'DB-02: anon ne peut pas lire tenants.subscription_status'
);
select throws_ok(
  'select phone from public.tenants limit 1',
  '42501', null,
  'DB-02: anon ne peut pas lire tenants.phone'
);
select throws_ok(
  'select address from public.tenants limit 1',
  '42501', null,
  'DB-02: anon ne peut pas lire tenants.address'
);
select throws_ok(
  'select activation_events from public.tenants limit 1',
  '42501', null,
  'DB-02: anon ne peut pas lire tenants.activation_events'
);

-- Non-regression vitrine: ce que le storefront et le manifeste PWA lisent
-- reellement doit continuer de passer.
select lives_ok(
  'select slug, name from public.tenants limit 1',
  'DB-02 non-regression: anon lit toujours tenants.slug et tenants.name'
);
select lives_ok(
  'select name, logo_url, primary_color from public.tenants where deleted_at is null limit 1',
  'DB-02 non-regression: le manifeste PWA (name, logo_url, primary_color, filtre deleted_at) passe'
);
select lives_ok(
  'select id, primary_color, currency, opening_hours, custom_domain from public.tenants limit 1',
  'DB-02 non-regression: les colonnes vitrine restent lisibles'
);

-- ---------------------------------------------------------------- DB-06 coupons
select throws_ok(
  'select code from public.coupons limit 1',
  '42501', null,
  'DB-06: anon ne peut plus enumerer les codes promo'
);

-- ------------------------------------------------------- DB-01 push_subscriptions
select throws_ok(
  'select endpoint, p256dh, auth from public.push_subscriptions limit 1',
  '42501', null,
  'DB-01: anon ne peut pas lire les credentials Web Push'
);

-- -------------------------------------------------------------------- DB-07 ads
select throws_ok(
  'select id from public.ads limit 1',
  '42501', null,
  'DB-07: anon ne peut pas lire ads'
);

-- ------------------------------------------------------------------- DB-12 ecriture
select throws_ok(
  'insert into public.categories (id) values (gen_random_uuid())',
  '42501', null,
  'DB-12: anon ne peut pas inserer dans categories'
);
select throws_ok(
  'delete from public.admin_users',
  '42501', null,
  'DB-12: anon ne peut pas supprimer dans admin_users'
);

reset role;

-- Assertions structurelles, hors role.
-- Une seule exception attendue: l INSERT newsletter (formulaire public du site
-- vitrine). Toute AUTRE ecriture accordee a anon doit faire echouer ce test.
select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
     and not (table_name = 'newsletter_subscriber' and privilege_type = 'INSERT')),
  0,
  'DB-12: aucun privilege d ecriture pour anon, hors l INSERT newsletter'
);

select ok(
  exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and table_name = 'newsletter_subscriber' and privilege_type = 'INSERT'
  ),
  'DB-12 non-regression: le formulaire newsletter du site vitrine peut toujours inserer'
);

select is(
  (select count(*)::int
   from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tenants'),
  0,
  'DB-02: public.tenants n est plus dans la publication supabase_realtime (le realtime ignore les grants colonne)'
);

select is(
  (select count(*)::int
   from pg_policies
   where tablename = 'push_subscriptions' and qual = 'true'),
  0,
  'DB-01: plus aucune policy USING (true) sur push_subscriptions'
);

select * from finish();
rollback;
