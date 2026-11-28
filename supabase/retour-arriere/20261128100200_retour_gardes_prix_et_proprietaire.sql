-- RETOUR ARRIERE de MIG3 (20261128100200_gardes_prix_et_proprietaire.sql).
--
-- Supprime la garde du prix par colonne et la protection du proprietaire.
-- Aucune donnee n'est touchee. A lancer AVANT le retour arriere de MIG2 : la
-- garde du prix appelle `has_tenant_write_permission(..., 'menu.price')`, un
-- code que l'ancienne resolution par roles ne connait pas (elle l'accorderait
-- a l'administrateur et au gerant par sa branche ELSE, et le refuserait au
-- chef : plus personne d'autre ne changerait un prix).
--
-- LANCEMENT : psql "$URL" -X -v ON_ERROR_STOP=1 -f ce_fichier

BEGIN;

DROP TRIGGER IF EXISTS garder_proprietaire_trg ON public.admin_users;
DROP FUNCTION IF EXISTS private.garder_proprietaire();

DROP TRIGGER IF EXISTS trg_item_modifiers_prix ON public.item_modifiers;
DROP TRIGGER IF EXISTS trg_menu_items_prix ON public.menu_items;
DROP FUNCTION IF EXISTS public.garder_prix_carte();

COMMIT;
