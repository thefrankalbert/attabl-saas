-- ============================================================================
-- Index sur les 7 cles etrangeres qui n'en avaient pas (constat L1, audit de
-- mise en production du 2026-11-23).
-- ============================================================================
--
-- LE DEFAUT. Sept cles etrangeres de `public` n'avaient aucun index commencant
-- par leur colonne (liste re-derivee du catalogue: pg_constraint contype 'f'
-- sans pg_index dont indkey[0] = la colonne). Deux effets: une lecture par la
-- cle (les notes d'une commande, lues a chaque fiche de commande; les commandes
-- d'une ardoise) parcourt la table entiere, et toute suppression ou mise a
-- jour de la ligne referencee (un membre retire, une ardoise) parcourt la
-- table enfant pour verifier la contrainte.
--
-- CE QUE FAIT CETTE MIGRATION. Ajoute uniquement des index, `if not exists`:
-- aucune donnee, aucun droit, aucune politique ne change. Rejouable.
-- Chaque index porte la colonne seule: la verification d'une cle etrangere
-- n'utilise qu'un index qui commence par sa colonne, et les lectures filtrent
-- sur elle (`.eq('order_id', ...)`).
--
-- Sans CONCURRENTLY: les migrations s'appliquent dans une transaction
-- (psql --single-transaction), ou CONCURRENTLY est interdit. Ces tables sont
-- petites (les 7 restaurants de la production sont des restaurants de test):
-- le verrou d'ecriture pendant la construction dure une fraction de seconde.
--
-- ORDRE DE DEPLOIEMENT. Indifferent, aucun code ne change, aucun acces n'est
-- retire.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.idx_house_accounts_created_by;
--   DROP INDEX IF EXISTS public.idx_house_accounts_settled_by;
--   DROP INDEX IF EXISTS public.idx_order_notes_created_by;
--   DROP INDEX IF EXISTS public.idx_order_notes_order_id;
--   DROP INDEX IF EXISTS public.idx_orders_comped_by;
--   DROP INDEX IF EXISTS public.idx_orders_house_account_id;
--   DROP INDEX IF EXISTS public.idx_reminder_settings_updated_by;
-- Le test supabase/tests/rls/index_cles_etrangeres.test.sql echoue alors.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON public.order_notes (order_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_created_by ON public.order_notes (created_by);
CREATE INDEX IF NOT EXISTS idx_orders_house_account_id ON public.orders (house_account_id);
CREATE INDEX IF NOT EXISTS idx_orders_comped_by ON public.orders (comped_by);
CREATE INDEX IF NOT EXISTS idx_house_accounts_created_by ON public.house_accounts (created_by);
CREATE INDEX IF NOT EXISTS idx_house_accounts_settled_by ON public.house_accounts (settled_by);
CREATE INDEX IF NOT EXISTS idx_reminder_settings_updated_by ON public.reminder_settings (updated_by);
