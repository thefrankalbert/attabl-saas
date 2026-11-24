-- Garde: chaque colonne de public.tenants a un droit de lecture DECIDE.
--
-- Depuis 20261109000000 (authenticated) et 20261109002847 (anon), aucun des
-- deux roles n'a plus SELECT sur toute la table: ils ont une LISTE de colonnes,
-- figee au moment ou ces migrations ont tourne. Une colonne ajoutee ensuite est
-- donc illisible pour les deux roles. La page qui la lit casse en production
-- (42501 permission denied), sans rien au build ni aux tests Vitest, qui
-- remplacent justement la base par une doublure.
--
-- Ce test echoue tant qu'une nouvelle colonne n'est pas classee. Dans la
-- migration qui ajoute la colonne:
--   - lue par le dashboard (cas normal):
--       GRANT SELECT (ma_colonne) ON public.tenants TO authenticated;
--   - secrete meme pour le restaurateur: l'ajouter a la liste "privees" ci-dessous.
--   - affichee sur la vitrine publique (rare, a justifier):
--       GRANT SELECT (ma_colonne) ON public.tenants TO anon;
--     et l'ajouter a la liste "anon" ci-dessous.
--
-- Execution: psql "$LOCAL_DB" -f supabase/tests/rls/tenants_column_grants.test.sql
--
-- Les colonnes sont lues dans pg_attribute de `public.tenants`, et non dans
-- information_schema.columns filtre par schema: sur une pile Supabase locale,
-- Postgres pouvait evaluer has_column_privilege AVANT le filtre, sur les
-- colonnes de `_realtime.tenants`, et le test tombait en erreur
-- ("column external_id of relation tenants does not exist").

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

select is(
  array(
    select c.attname::text
      from pg_attribute c
     where c.attrelid = 'public.tenants'::regclass and c.attnum > 0 and not c.attisdropped
       and not has_column_privilege('authenticated', 'public.tenants', c.attname, 'SELECT')
     order by 1
  ),
  array['activation_events', 'anonymized_at', 'refund_frozen_at', 'stripe_customer_id', 'stripe_subscription_id']::text[],
  'tenants: seules les colonnes privees sont illisibles pour authenticated (nouvelle colonne = GRANT SELECT a authenticated)'
);

select is(
  array(
    select c.attname::text
      from pg_attribute c
     where c.attrelid = 'public.tenants'::regclass and c.attnum > 0 and not c.attisdropped
       and has_column_privilege('anon', 'public.tenants', c.attname, 'SELECT')
     order by 1
  ),
  array[
    'currency', 'custom_domain', 'default_locale', 'deleted_at', 'description',
    'enable_coupons', 'enable_service_charge', 'enable_tax', 'establishment_type',
    'id', 'is_active', 'logo_url', 'name', 'opening_hours', 'primary_color',
    'secondary_color', 'service_charge_rate', 'slug', 'supported_currencies',
    'table_count', 'tax_rate'
  ]::text[],
  'tenants: anon lit exactement les colonnes de la vitrine, ni plus ni moins'
);

-- Ecriture: la liste exacte des colonnes que le restaurateur modifie lui-meme.
-- Une colonne de reglage ajoutee sans GRANT UPDATE casse son ecran en silence
-- (constat C-069: les modes de paiement ne s'enregistraient jamais). Une colonne
-- de facturation ou de droit du plan ne doit JAMAIS apparaitre ici.
-- `custom_domain` en est volontairement absente: l'ouvrir est une decision de
-- securite (le routage des restaurants en depend), pas un oubli. `slug` aussi,
-- pour la meme raison, depuis 20261123100400 (audit B117): un proprietaire qui
-- prenait l'adresse `login` faisait servir sa page sur login.attabl.com.
select is(
  array(
    select c.attname::text
      from pg_attribute c
     where c.attrelid = 'public.tenants'::regclass and c.attnum > 0 and not c.attisdropped
       and has_column_privilege('authenticated', 'public.tenants', c.attname, 'UPDATE')
     order by 1
  ),
  array[
    'address', 'bar_display_enabled', 'city', 'country', 'currency', 'default_locale',
    'description', 'enable_coupons', 'enable_service_charge', 'enable_tax',
    'enabled_payment_methods', 'establishment_details', 'establishment_type',
    'idle_timeout_minutes', 'logo_url', 'name', 'notification_sound_id',
    'onboarding_completed', 'onboarding_completed_at', 'opening_hours', 'phone',
    'primary_color', 'screen_lock_mode', 'secondary_color', 'service_charge_rate',
    'supported_currencies', 'table_count', 'tax_rate', 'updated_at'
  ]::text[],
  'tenants: authenticated ecrit exactement les colonnes de reglage, aucune de facturation'
);

-- Le comportement, pas seulement la liste (audit B117): un proprietaire avec
-- sa session ne change pas l'adresse de son restaurant, mais garde son nom.
insert into public.tenants (id, slug, name, is_active, currency, subscription_status) values
  ('b1170000-0000-0000-0000-00000000000a', 'b117-resto', 'Resto B117', true, 'XOF', 'active');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('e1170000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'owner-b117@exemple.test', 'x', now(), now());
insert into public.admin_users (id, user_id, tenant_id, email, role, is_active) values
  ('d1170000-0000-0000-0000-00000000000a', 'e1170000-0000-0000-0000-00000000000a',
   'b1170000-0000-0000-0000-00000000000a', 'owner-b117@exemple.test', 'owner', true);

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"e1170000-0000-0000-0000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$update public.tenants set slug = 'login' where id = 'b1170000-0000-0000-0000-00000000000a'$$,
  '42501', NULL,
  'un proprietaire ne peut pas changer l adresse (slug) de son restaurant');

select lives_ok(
  $$update public.tenants set name = 'Resto B117 renomme' where id = 'b1170000-0000-0000-0000-00000000000a'$$,
  'temoin: le proprietaire peut toujours renommer son restaurant');

reset role;

select * from finish();
rollback;
