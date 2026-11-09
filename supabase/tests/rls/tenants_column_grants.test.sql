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

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

select is(
  array(
    select c.column_name::text
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'tenants'
       and not has_column_privilege('authenticated', 'public.tenants', c.column_name, 'SELECT')
     order by 1
  ),
  array['activation_events', 'stripe_customer_id', 'stripe_subscription_id']::text[],
  'tenants: seules les colonnes privees sont illisibles pour authenticated (nouvelle colonne = GRANT SELECT a authenticated)'
);

select is(
  array(
    select c.column_name::text
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'tenants'
       and has_column_privilege('anon', 'public.tenants', c.column_name, 'SELECT')
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

select * from finish();
rollback;
