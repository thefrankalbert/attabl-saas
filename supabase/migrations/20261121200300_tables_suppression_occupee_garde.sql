-- ============================================================================
-- Une table occupee ne se supprime pas (revue L015, A17, seconde garde).
-- ============================================================================
--
-- LE DEFAUT. `orders.table_id` est ON DELETE SET NULL et `table_sessions` est
-- rattachee par `table_number` (texte, sans cle etrangere). Supprimer une table
-- qui a une session ouverte detachait ses commandes sans fermer la session: la
-- note restait ouverte, sans table en salle. L'application refuse deja
-- (table-config.service.ts, CONFLICT), mais entre sa verification et la
-- suppression une commande pouvait ouvrir la table, et un role autorise par la
-- RLS de `tables` supprimait directement par l'API.
--
-- LE CORRECTIF. Declencheur BEFORE DELETE sur `tables`: refus s'il existe une
-- session ouverte (`table_sessions.status = 'open'`) pour le meme restaurant et
-- le meme numero. La suppression d'une ZONE est couverte: `tables.zone_id` est
-- ON DELETE CASCADE, donc chaque table de la zone passe par ce declencheur.
-- Le declencheur TENTE LE MEME verrou que create_order_with_items et
-- close_table_session_if_settled ('table_session:<tenant>:<numero>'), SANS
-- l'attendre (pg_try_advisory_xact_lock):
--   - si une commande est en cours sur cette table, elle tient le verrou: la
--     suppression est refusee tout de suite (55P03, "table en cours
--     d'utilisation") et la commande se termine normalement. Attendre ici
--     donnait un interblocage mesure (second contre-audit du lot A): la
--     suppression tient deja la ligne de `tables` quand le declencheur
--     s'execute, et la commande, qui tient le verrou consultatif, attend cette
--     ligne pour sa cle etrangere (`orders.table_id`). Postgres annulait alors
--     la COMMANDE du client ("deadlock detected");
--   - sinon la suppression prend le verrou: une commande qui arrive attend la
--     fin de la suppression. Si la table a ete supprimee, la commande echoue sur
--     sa cle etrangere, exactement comme sans ce declencheur.
--
-- QUI EST JUGE. Seuls les appels d'un utilisateur connecte (role JWT
-- `authenticated`) ou anonyme. Le service_role (remise a zero, suppression d'un
-- restaurant par la console) et les sessions sans JWT (migrations, psql) restent
-- libres: la suppression d'un restaurant cascade sur ses tables alors que ses
-- sessions existent encore.
--
-- SECURITY DEFINER, et pourquoi c'est sur ici. La lecon du projet (un
-- declencheur de garde doit etre INVOKER) vise les gardes qui lisent
-- `current_user`: en DEFINER il vaut toujours le proprietaire. Celle-ci ne lit
-- PAS `current_user`: elle lit le role du JWT (`auth.role()`, reglage de la
-- requete, identique en DEFINER et en INVOKER). C'est d'ailleurs pour cela que
-- la cascade d'une zone est jugee: une action referentielle s'execute sous le
-- proprietaire de la table, `current_user` y vaudrait `postgres` et une garde
-- fondee sur lui laisserait passer la suppression d'une zone. DEFINER permet
-- en plus de lire `table_sessions` sans dependre de sa RLS. La fonction ne lit
-- que la session visee par OLD. EXECUTE est retire a PUBLIC, anon et
-- authenticated; service_role le garde (droits par defaut de Supabase), sans
-- effet: une fonction de declencheur ne s'appelle pas directement.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_tables_delete_occupied_guard ON public.tables;
--   DROP FUNCTION IF EXISTS public.guard_table_delete_occupied();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guard_table_delete_occupied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN OLD;
  END IF;
  IF OLD.table_number IS NULL THEN
    RETURN OLD;
  END IF;

  IF NOT pg_try_advisory_xact_lock(
    hashtext('table_session:' || OLD.tenant_id::text || ':' || OLD.table_number)
  ) THEN
    RAISE EXCEPTION 'Cette table est en cours d''utilisation. Reessayez dans un instant.'
      USING ERRCODE = '55P03', HINT = 'table_busy';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.table_sessions ts
     WHERE ts.tenant_id = OLD.tenant_id
       AND ts.table_number = OLD.table_number
       AND ts.status = 'open'
  ) THEN
    RAISE EXCEPTION 'Une table est occupee. Encaissez et liberez-la avant de la supprimer.'
      USING ERRCODE = '23514', HINT = 'table_occupied';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_table_delete_occupied() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tables_delete_occupied_guard ON public.tables;
CREATE TRIGGER trg_tables_delete_occupied_guard
  BEFORE DELETE ON public.tables
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_table_delete_occupied();
