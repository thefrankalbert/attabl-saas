-- RETOUR ARRIERE de 20261128100400_garde_statut_cuisine.sql.
--
-- Supprime la garde des statuts de cuisine. Aucune donnee n'est touchee. A
-- lancer AVANT le retour arriere de MIG2 : la garde appelle
-- `has_tenant_write_permission(..., 'kitchen.track')`, un code que l'ancienne
-- resolution par roles ne connait pas.
--
-- LANCEMENT : psql "$URL" -X -v ON_ERROR_STOP=1 -f ce_fichier

BEGIN;

DROP TRIGGER IF EXISTS trg_order_items_statut_cuisine ON public.order_items;
DROP TRIGGER IF EXISTS trg_orders_statut_cuisine ON public.orders;
DROP FUNCTION IF EXISTS public.garder_statut_cuisine();

COMMIT;
