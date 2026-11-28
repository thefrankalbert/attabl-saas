-- Lot 1 des roles du personnel, corrections des audits : les statuts de cuisine
-- exigent `kitchen.track` (cahier des charges, section 5, "Suivre en cuisine ou
-- au bar" : proprietaire, gerant, chef, cuisinier, barman).
--
-- POURQUOI. La politique UPDATE de `orders` et de `order_items` (MIG2) laisse
-- passer `orders.take` OU `kitchen.track` : un caissier ou un serveur passait
-- une commande "en preparation" ou "prete", et retirer `kitchen.track` a
-- quelqu'un ne changeait rien. La politique ne peut pas juger la VALEUR ecrite
-- sans dupliquer son texte ; un declencheur par colonne le fait, comme la garde
-- du prix (MIG3).
--
-- LA REGLE (la meme que `orderStatusRequirement` dans src/lib/admin-roles.ts) :
--   - poser `preparing` ou `ready` sur une commande ou sur une ligne :
--     `kitchen.track` ;
--   - tout autre statut (`pending`, `delivered`, `served`) : inchange, la
--     politique decide (salle ou cuisine). Servir reste le geste du serveur ;
--   - `cancelled` : inchange (`refuser_argent_sans_orders_pay`, decision G.b.2).
--
-- service_role, postgres, taches planifiees et fonctions SECURITY DEFINER :
-- hors de cette garde, comme pour la garde du prix.
--
-- ORDRE EN PRODUCTION : APRES la mise en service du nouveau code, jamais avant.
-- Ce fichier RETIRE un geste que l'ancien code offre encore au serveur et au
-- caissier. Mesure du 2026-11-28, ancien code contre une base qui porte cette
-- garde : "en preparation" par un serveur rend une erreur 500, que la file hors
-- ligne rejoue comme une panne. Le nouveau code refuse deja ce geste lui-meme
-- et ne depend pas de ce fichier. Voir docs/roles-personnel/deroule-production.md.
--
-- RETOUR ARRIERE : supabase/retour-arriere/20261128100400_retour_garde_statut_cuisine.sql
-- (avant ceux de MIG3, MIG2 et MIG1).

BEGIN;

CREATE OR REPLACE FUNCTION public.garder_statut_cuisine() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $function$
DECLARE
  v_statut text;
BEGIN
  -- SECURITY INVOKER voulu : current_user doit etre celui de l'appelant (en
  -- DEFINER il vaudrait toujours le proprietaire de la fonction et la garde ne
  -- se declencherait jamais).
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'orders' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    v_statut := NEW.status;
  ELSE
    IF NEW.item_status IS NOT DISTINCT FROM OLD.item_status THEN
      RETURN NEW;
    END IF;
    v_statut := NEW.item_status;
  END IF;
  IF v_statut IN ('preparing', 'ready')
     AND NOT public.has_tenant_write_permission(NEW.tenant_id, 'kitchen.track') THEN
    RAISE EXCEPTION 'setting a kitchen status requires the kitchen.track permission'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.garder_statut_cuisine() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_orders_statut_cuisine ON public.orders;
CREATE TRIGGER trg_orders_statut_cuisine BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.garder_statut_cuisine();
DROP TRIGGER IF EXISTS trg_order_items_statut_cuisine ON public.order_items;
CREATE TRIGGER trg_order_items_statut_cuisine BEFORE UPDATE OF item_status ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.garder_statut_cuisine();

COMMIT;
