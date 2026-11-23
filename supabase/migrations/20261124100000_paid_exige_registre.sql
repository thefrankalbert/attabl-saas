-- ============================================================================
-- Une commande ne DEVIENT 'paid' que si le registre `payments` couvre son du
-- (constat B150, revue ligne par ligne).
-- ============================================================================
--
-- LE DEFAUT. Rien en base ne liait `orders.payment_status = 'paid'` au
-- registre. Un employe qui detient `orders.pay` (caissier) pouvait, par un
-- UPDATE direct de `orders` par l'API PostgREST avec son propre jeton, marquer
-- 'paid' une commande sans AUCUNE ligne au registre, ou avec un registre qui ne
-- couvre pas le du. La session de table se fermait, la commande sortait des
-- impayes, et l'argent pouvait disparaitre sans ecart visible au registre.
-- Prouve par essai en role caissier (contre-audits du lot A, passes 6 et 7).
-- L'application ne propose pas ce geste, mais l'API le permettait.
--
-- CE QUE FAIT CETTE MIGRATION. Un declencheur de CONTRAINTE, reporte a la
-- validation de la transaction (DEFERRABLE INITIALLY DEFERRED), sur le
-- PASSAGE a 'paid' (INSERT d'une commande deja 'paid', ou UPDATE d'un autre
-- statut vers 'paid'). A la validation, il relit la commande et le registre et
-- refuse si le registre ne couvre pas le du, avec la regle de
-- src/services/payment.calc.ts:
--   du  = total + pourboire (unites mineures entieres)
--   net = somme des versements 'completed' moins somme des 'refunded'
--   'paid' si net > 0 et net >= du.
-- Les montants sont des entiers: "net > 0 et net >= du" equivaut a
-- "net >= greatest(du, 1)", qui est ce qui est verifie.
--
-- COMMANDE AU DU NUL (total 0 et pourboire 0). La regle ci-dessus la refuse
-- (net > 0 impossible: la garde du registre plafonne au solde du). Seule
-- exception: qui a l'autorite sur l'argent (has_tenant_money_permission:
-- owner, admin, manager). C'est le seul chemin qui solde aujourd'hui une telle
-- commande: un gerant qui l'encaisse a la caisse (encaisser_commande ecrit une
-- ligne a 0, que la garde du registre n'accepte que de cette autorite). Pour un
-- caissier, la liberte ne servirait aucun chemin legitime (il ne peut deja pas
-- encaisser une commande a 0) et elle ouvrait un detournement: une commande a
-- 0 qui porte des plats, soldee sans rien au registre.
--
-- POURQUOI REPORTE, ET PAS UN DECLENCHEUR BEFORE. `encaisser_commande`
-- (20261120220000) bascule la commande PUIS insere la ligne au registre, dans
-- la meme transaction, et son calcul du pourboire comme son plafond supposent
-- cet ordre. Un controle immediat verrait la commande 'paid' AVANT la ligne et
-- refuserait l'encaissement normal. Reporte a la validation, il voit la ligne
-- inseree par la meme transaction. On ne reordonne donc pas l'encaissement.
--
-- QUI EST CONTRAINT. Seuls les deux roles joignables par un client,
-- `authenticated` et `anon`, comme toutes les gardes de `orders`
-- (refuser_argent_sans_orders_pay, refuser_reecriture_montants_commande,
-- normaliser_creation_commande). service_role (route POS, crons, webhooks),
-- le proprietaire `postgres` (migrations, scripts) et toute session sans JWT
-- restent libres. Le role est lu par `current_user` AU MOMENT OU LE CONTROLE
-- S'EXECUTE, c'est-a-dire a la validation: PostgREST pose `SET LOCAL ROLE` pour
-- toute la transaction, donc c'est encore `authenticated` a ce moment (prouve
-- par essai). Une ecriture faite dans une fonction SECURITY DEFINER appelee
-- par un employe est donc controlee elle aussi: le controle ne s'execute pas
-- dans la fonction mais a la validation, A CONDITION que la fonction ne force
-- pas `SET CONSTRAINTS ... IMMEDIATE` (elle executerait alors le controle sous
-- son propre role, qui est libre). Mesure le 2026-11-23: aucune fonction de
-- `public` executable par `authenticated` ou `anon` ne contient
-- `SET CONSTRAINTS` ni de SQL dynamique, et PostgREST ne permet pas d'emettre
-- cette commande. Une fonction future qui le ferait rouvrirait la porte.
--
-- La regle vaut pour TOUT role authentifie, gerant et proprietaire compris
-- (hors du nul ci-dessus): aucun chemin applicatif legitime ne pose 'paid'
-- sans registre sous jeton d'employe (inventaire dans le rapport du lot B150).
-- D'autres statuts closent une commande sans registre et ne sont PAS couverts
-- ici, car ils ne posent pas 'paid': l'offert ('comp', trace par is_comp,
-- comp_reason, comped_by) et 'refunded'. Un gerant peut passer une commande
-- 'pending' en 'refunded' sans aucune ligne au registre (contre-audit 1, A23):
-- elle sort alors des impayes et ne bloque plus la table, sans colonne qui
-- trace le geste. Reserve a l'autorite sur l'argent par la politique UPDATE;
-- choix a trancher par le proprietaire, hors de cette migration.
--
-- SECURITY INVOKER, et pourquoi. Le controle lit `current_user`: en SECURITY
-- DEFINER il vaudrait toujours le proprietaire et le controle ne s'appliquerait
-- jamais. Il lit donc `orders` et `payments` sous les droits de l'appelant.
-- C'est suffisant et ferme par defaut: la politique UPDATE de `orders` exige
-- l'appartenance au restaurant (has_tenant_write_permission), et la politique
-- SELECT de `payments` (payments_tenant_select) ouvre au membre les paiements
-- de son restaurant. Un appelant qui ne verrait pas le registre lirait un net
-- de 0 et serait REFUSE, jamais laisse passer.
--
-- CE QUI N'EST PAS TOUCHE. Le retour arriere ('paid' vers un autre statut) n'est
-- pas concerne. Les commandes deja 'paid' sans registre en base ne sont NI
-- validees NI modifiees: un declencheur ne juge que les ecritures a venir, et
-- cette migration ne modifie aucune donnee. Un changement de table, une
-- annulation, l'avancement en cuisine ne mettent pas en file le controle (sa
-- condition WHEN exige un passage a 'paid').
--
-- COUT. Une lecture de la commande par sa cle primaire et une somme sur
-- `payments` par l'index (tenant_id, order_id), seulement au passage a 'paid'.
--
-- ORDRE DE DEPLOIEMENT. Peut passer AVANT ou APRES le code actuellement en
-- ligne: c'est une correction de base seule, aucun changement de code n'est
-- requis. Chaque chemin legitime ecrit deja le registre avant ou dans la meme
-- transaction que la bascule (essais de bout en bout du lot B150):
-- encaisser_commande (bascule puis ligne, meme transaction), recompute apres
-- recordTender (ligne dans une transaction precedente), resyncStatus (registre
-- deja complet), route POS (service_role). Rejouable.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_paid_exige_registre_update ON public.orders;
--   DROP TRIGGER IF EXISTS trg_paid_exige_registre_insert ON public.orders;
--   DROP FUNCTION IF EXISTS public.exiger_registre_pour_paid();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.exiger_registre_pour_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_total bigint;
  v_tip bigint;
  v_tenant uuid;
  v_du numeric;
  v_net numeric;
BEGIN
  -- Lu a la validation de la transaction, pas au moment de l'ecriture.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NULL;
  END IF;

  -- Etat COURANT de la commande, pas celui de l'ecriture mise en file: si la
  -- meme transaction l'a fait repasser a un autre statut, il n'y a plus rien a
  -- controler. Les montants ne bougent plus apres la creation
  -- (refuser_reecriture_montants_commande), sauf le pourboire a
  -- l'encaissement: on prend donc la valeur courante.
  SELECT o.payment_status, o.total, o.tip_amount, o.tenant_id
    INTO v_status, v_total, v_tip, v_tenant
    FROM public.orders o
   WHERE o.id = NEW.id;

  IF FOUND THEN
    IF v_status IS DISTINCT FROM 'paid' THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Ligne invisible (ou supprimee dans la meme transaction): on juge sur la
    -- valeur ecrite. Ferme par defaut.
    v_total := NEW.total;
    v_tip := NEW.tip_amount;
    v_tenant := NEW.tenant_id;
  END IF;

  v_du := coalesce(v_total, 0) + coalesce(v_tip, 0);

  -- Meme filtre que fetchTenders (payment.queries.ts): cette commande, ce
  -- restaurant. `payments.status` ne vaut que 'completed' ou 'refunded'
  -- (contrainte payments_status_check).
  SELECT coalesce(sum(CASE WHEN p.status = 'refunded' THEN -p.amount
                           WHEN p.status = 'completed' THEN p.amount
                           ELSE 0 END), 0)
    INTO v_net
    FROM public.payments p
   WHERE p.order_id = NEW.id
     AND p.tenant_id = v_tenant;

  -- Regle de deriveStatus (net > 0 et net >= du), sauf le du nul pour
  -- l'autorite sur l'argent (voir l'en-tete).
  IF v_net < greatest(v_du, 1)
     AND NOT (v_du <= 0 AND public.has_tenant_money_permission(v_tenant))
  THEN
    RAISE EXCEPTION
      'Une commande ne passe payee que si le registre des paiements couvre son du'
      USING ERRCODE = '42501',
            HINT = 'orders_paid_exige_registre';
  END IF;

  RETURN NULL;
END;
$$;

-- Une fonction de declencheur ne s'appelle pas directement; personne n'a
-- besoin de EXECUTE dessus (un declencheur s'execute sans ce droit).
REVOKE ALL ON FUNCTION public.exiger_registre_pour_paid() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exiger_registre_pour_paid() FROM anon, authenticated, service_role;

-- Deux declencheurs: une condition WHEN d'INSERT ne peut pas citer OLD.
-- AFTER UPDATE sans liste de colonnes: le passage a 'paid' est detecte quelle
-- que soit la forme de l'UPDATE, la condition WHEN suffit a ne rien mettre en
-- file pour les autres ecritures.
DROP TRIGGER IF EXISTS trg_paid_exige_registre_update ON public.orders;
CREATE CONSTRAINT TRIGGER trg_paid_exige_registre_update
  AFTER UPDATE ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.exiger_registre_pour_paid();

DROP TRIGGER IF EXISTS trg_paid_exige_registre_insert ON public.orders;
CREATE CONSTRAINT TRIGGER trg_paid_exige_registre_insert
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid')
  EXECUTE FUNCTION public.exiger_registre_pour_paid();
