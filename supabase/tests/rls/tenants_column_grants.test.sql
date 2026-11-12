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

select plan(3);

select is(
  array(
    select c.attname::text
      from pg_attribute c
     where c.attrelid = 'public.tenants'::regclass and c.attnum > 0 and not c.attisdropped
       and not has_column_privilege('authenticated', 'public.tenants', c.attname, 'SELECT')
     order by 1
  ),
  array['activation_events', 'stripe_customer_id', 'stripe_subscription_id']::text[],
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
-- securite (le routage des restaurants en depend), pas un oubli.
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
    'primary_color', 'screen_lock_mode', 'secondary_color', 'service_charge_rate', 'slug',
    'supported_currencies', 'table_count', 'tax_rate', 'updated_at'
  ]::text[],
  'tenants: authenticated ecrit exactement les colonnes de reglage, aucune de facturation'
);

select * from finish();
rollback;
