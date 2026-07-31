-- DB-02 - public.tenants: le fichier client complet est lisible par un anonyme.
--
-- Verifie en production le 2026-07-31 avec la cle anon publique (celle du bundle
-- navigateur): GET /rest/v1/tenants?select=stripe_customer_id,subscription_status,phone
-- renvoie 200 et 4 lignes. Colonnes reellement exposees: stripe_customer_id,
-- stripe_subscription_id, subscription_plan, subscription_status,
-- subscription_current_period_end, trial_ends_at, phone, address, max_admins,
-- max_venues, last_active_at, activation_events.
--
-- Cause: GRANT SELECT sur la table ENTIERE pour anon (herite du schema d'origine,
-- anterieur au suivi des migrations) combine a la policy "Public can read active
-- tenants" (sans clause TO, donc role public). Contrairement a orders/order_items,
-- tenants n'a jamais recu de traitement colonne par colonne.
--
-- La policy est CONSERVEE: la vitrine en a besoin. On reduit la surface au niveau
-- des colonnes, ce que la RLS ne sait pas faire.
--
-- Verifie avant ecriture (pour ne pas casser la vitrine):
--   - la lecture tenant du storefront passe par createCacheClient() dans
--     src/lib/cache.ts, qui utilise la cle service_role: elle contourne RLS et
--     grants colonne, donc elle n'est pas affectee;
--   - la seule lecture en role anon est src/app/sites/[site]/manifest.webmanifest,
--     qui selectionne name, logo_url, primary_color et filtre sur slug et
--     deleted_at. Ces 5 colonnes sont dans la liste blanche ci-dessous
--     (deleted_at incluse: filtrer sur une colonne exige le privilege SELECT
--     sur cette colonne);
--   - useTenantSettings.ts et usePOSData.ts lisent tenants depuis le navigateur
--     mais uniquement sur des surfaces admin, donc en role authenticated.
--
-- Rollback:
--   revoke all on table public.tenants from anon;
--   grant select on table public.tenants to anon;
--   alter publication supabase_realtime add table public.tenants;

revoke all on table public.tenants from anon;

grant select (
  id,
  slug,
  name,
  logo_url,
  primary_color,
  secondary_color,
  description,
  establishment_type,
  currency,
  tax_rate,
  service_charge_rate,
  enable_tax,
  enable_service_charge,
  enable_coupons,
  supported_currencies,
  opening_hours,
  default_locale,
  is_active,
  table_count,
  custom_domain,
  deleted_at
) on table public.tenants to anon;

-- Le realtime n'applique PAS les grants colonne. C'est documente noir sur blanc
-- dans 20260623110000_order_status_broadcast.sql, et c'est la raison pour laquelle
-- orders est passe par Broadcast. Or 20260716000000_realtime_menu_live.sql a ajoute
-- public.tenants a la publication: le payload CDC re-exposerait en streaming les
-- colonnes revoquees ci-dessus. On retire donc tenants de la publication.
do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tenants'
  ) then
    execute 'alter publication supabase_realtime drop table public.tenants';
  end if;
end $$;
