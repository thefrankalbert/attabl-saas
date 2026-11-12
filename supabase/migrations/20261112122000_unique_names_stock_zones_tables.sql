-- Doublons acceptes sans avertissement (audit du 2026-11-10, C-045, C-046, C-074).
--
-- POURQUOI. Rien en base n'empechait deux ingredients "Farine" (une fiche
-- technique pouvait pointer sur le mauvais), deux fournisseurs identiques, deux
-- zones "Terrasse" dans le meme etablissement, ni deux zones au prefixe "TER".
-- Ce dernier cas est le plus grave: le prefixe fabrique le numero de table
-- (TER-1), et le QR retrouve la table par ce numero dans TOUT le restaurant.
-- Deux "TER-1" = un QR qui peut ouvrir la mauvaise table.
--
-- EXPRESSIONS. `lower(name)` est celle qu'emploient deja l'import Excel des
-- fiches techniques (import_recipes_tx) et celui des fournisseurs: l'import
-- retrouve la ligne existante au lieu de buter sur l'index.
-- - ingredients: seulement les actifs. Un ingredient desactive ne bloque pas
--   la creation d'un nouveau du meme nom (import_recipes_tx reprend deja
--   l'actif en priorite).
-- - zones: le nom est unique par etablissement, le prefixe par restaurant.
-- - tables: le numero est unique par restaurant (c'est la cle du QR).
--
-- Mesure en production avant ecriture (2026-11-12): zero doublon sur chacune
-- de ces cles, zero prefixe hors [A-Z0-9]. Les index se creent donc sans
-- toucher aucune donnee.
--
-- ADDITIVE: aucun droit retire, aucune donnee modifiee.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.ingredients_tenant_lower_name_active_key;
--   DROP INDEX IF EXISTS public.suppliers_tenant_lower_name_key;
--   DROP INDEX IF EXISTS public.zones_venue_lower_name_key;
--   DROP INDEX IF EXISTS public.zones_tenant_upper_prefix_key;
--   DROP INDEX IF EXISTS public.tables_tenant_table_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS ingredients_tenant_lower_name_active_key
  ON public.ingredients (tenant_id, lower(name)) WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenant_lower_name_key
  ON public.suppliers (tenant_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS zones_venue_lower_name_key
  ON public.zones (tenant_id, venue_id, lower(name)) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS zones_tenant_upper_prefix_key
  ON public.zones (tenant_id, upper(prefix));

CREATE UNIQUE INDEX IF NOT EXISTS tables_tenant_table_number_key
  ON public.tables (tenant_id, table_number);
