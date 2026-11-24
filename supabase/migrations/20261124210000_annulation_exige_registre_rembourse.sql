-- ============================================================================
-- Une commande dont l'argent est encore au registre ne s'annule pas par l'API
-- directe (constats X2, X3 et N3, audit de mise en production du 2026-11-23).
-- ============================================================================
--
-- VERSION. Ecrite d'abord sous 20261124120000, renommee 20261124210000 pour
-- s'appliquer APRES 20261124150000 (lot B2b-1, deja en production), dont elle
-- complete la regle sans rien redefinir. Elle n'a jamais ete appliquee sous
-- l'ancienne version.
--
-- CE QUE 20261124150000 COUVRE DEJA (declencheur BEFORE UPDATE
-- `refuser_argent_sans_orders_pay`, non touche ici): une commande `paid` ne
-- s'annule pour aucun client; annuler exige `orders.pay`; annuler une commande
-- `comp` ou `refunded` exige l'autorite sur l'argent. CE QU'IL NE COUVRE PAS,
-- et qui reste l'objet de ce declencheur: une commande `partial` (ou toute
-- commande non `paid`) dont l'argent net est encore au registre `payments`.
-- Un caissier (`orders.pay` sans autorite sur l'argent) l'annulait encore par
-- l'API directe, et la commande sortait du chiffre d'affaires avec son argent
-- en caisse (sonde du 2026-11-24, transaction COMMITEE, migrations de `main`
-- appliquees). Les deux gardes sont cumulatives: la plus stricte l'emporte, et
-- aucune n'autorise ce que l'autre refuse.
--
-- LE DEFAUT. Un employe qui detient `orders.pay` sans l'autorite sur l'argent
-- (un caissier) pouvait, par un UPDATE direct de `orders` par l'API PostgREST
-- avec son propre jeton, passer a 'cancelled' une commande 'paid' (5000 au
-- registre) ou 'partial' (2000 au registre). L'argent restait au registre
-- `payments`, la commande sortait du chiffre d'affaires et des impayes.
-- Reproduit en transaction COMMITEE sur une base jetable (20261124, sonde du
-- correcteur base de donnees). La migration 20261124100000 ne garde que le
-- passage a 'paid'; la politique UPDATE de `orders` ne demande que
-- `orders.manage`, et refuser_argent_sans_orders_pay que `orders.pay`.
--
-- LA REGLE DE L'APPLICATION, reproduite ici.
--   - cancelOrder (src/services/order/order-lifecycle.ts) refuse d'annuler une
--     commande payee, pour TOUT role: "utiliser un remboursement".
--   - Un remboursement n'est ouvert qu'a l'autorite sur l'argent (record_refund:
--     owner, admin, manager avec `orders.pay`).
--   - Une commande partiellement remboursee (registre net positif mais sous le
--     du) peut etre annulee depuis sa fiche: c'est la sortie que donne le
--     solde d'une ardoise (house-account-settlement.service.ts: "Encaissez son
--     reste ou annulez-la depuis sa fiche"). Cette decision porte sur de
--     l'argent encore en caisse: elle revient a qui a l'autorite sur l'argent,
--     comme deja l'annulation d'une commande 'refunded' ou 'comp' (politique
--     UPDATE de `orders`) et tout recul du statut de paiement
--     (refuser_reecriture_montants_commande).
-- D'ou, au passage a 'cancelled', avec net = encaissements 'completed' moins
-- remboursements 'refunded' de cette commande, et du = total + pourboire:
--   1. registre qui couvre le du (net > 0 et net >= du), ou commande encore
--      marquee 'paid': REFUSE pour tout role authentifie. Il faut d'abord
--      rembourser (record_refund), puis annuler.
--   2. sinon, net > 0 (de l'argent reste en caisse): REFUSE sauf autorite sur
--      l'argent (has_tenant_money_permission: owner, admin, manager).
--   3. net <= 0 (rien encaisse, ou tout rembourse): libre, comme avant.
-- Le registre fait foi, pas la colonne `payment_status`: un caissier qui
-- detient `orders.pay` peut reecrire cette colonne, pas le registre.
--
-- CHANGEMENT VISIBLE. Un caissier ne peut plus annuler une commande 'partial'
-- dont l'argent est au registre (c'etait le defaut X2). L'interface doit
-- masquer le bouton dans ce cas (CancelOrderButton, cancelOrder): signale au
-- correcteur du code applicatif.
--
-- FORME, copiee de 20261124100000. Declencheur de CONTRAINTE reporte a la
-- validation (DEFERRABLE INITIALLY DEFERRED): une transaction qui annule puis
-- rembourse, ou rembourse puis annule, est jugee sur son etat final. Il ne
-- joue que pour `authenticated` et `anon` (lu par `current_user` A LA
-- VALIDATION, quand PostgREST a encore son `SET LOCAL ROLE`): service_role
-- (route POS, crons, webhooks), `postgres` (migrations) et toute session sans
-- JWT restent libres. SECURITY INVOKER, obligatoirement: en SECURITY DEFINER,
-- `current_user` vaudrait toujours le proprietaire et la garde ne jouerait
-- jamais. Il lit donc `orders` et `payments` sous les droits de l'appelant;
-- la politique SELECT de `payments` ouvre au membre les paiements de son
-- restaurant, et un appelant qui ne les verrait pas lirait un net de 0: il
-- resterait refuse par la regle 1 si la commande est marquee 'paid'.
-- Aucune fonction de `public` ne pose 'cancelled' sur `orders` (mesure:
-- prosrc des fonctions de `public`), et aucune executable par un client ne
-- contient `SET CONSTRAINTS` (mesure du 2026-11-23, rappelee par
-- 20261124100000): le controle ne peut pas etre force sous un autre role.
--
-- CE QUI N'EST PAS TOUCHE. Les commandes deja annulees ne sont ni relues ni
-- modifiees. Une insertion directe d'une commande 'cancelled' n'est pas
-- couverte: la RLS ferme l'INSERT direct aux employes (20261124100200) et une
-- commande qui nait n'a aucune ligne au registre.
--
-- HINT. Deux valeurs, lues par cancelOrder (src/services/order/order-lifecycle.ts)
-- pour donner un message clair sans recalculer le registre cote application:
-- `orders_annulation_exige_remboursement` (regle 1) et
-- `orders_annulation_exige_autorite_argent` (regle 2). Changer les deux ensemble.
--
-- COUT. Une lecture par cle primaire et une somme sur `payments` par l'index
-- (tenant_id, order_id), seulement au passage a 'cancelled'.
--
-- ORDRE DE DEPLOIEMENT. Retire un acces (annulation par un caissier d'une
-- commande dont l'argent est au registre). Deployer le CODE D'ABORD (bouton
-- masque pour une commande 'partial' sans autorite sur l'argent), puis cette
-- migration; dans l'autre ordre, le caissier voit "Erreur lors de
-- l'annulation" au lieu d'un bouton absent, sans perte de donnees. Aucun
-- chemin legitime n'est casse: annulation d'une commande impayee (tout role
-- avec `orders.pay`), annulation apres remboursement total, annulation d'une
-- commande partiellement remboursee par un gerant, service_role. Rejouable.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_annulation_exige_registre_rembourse ON public.orders;
--   DROP FUNCTION IF EXISTS public.exiger_registre_rembourse_pour_annuler();
-- ============================================================================

CREATE OR REPLACE FUNCTION public.exiger_registre_rembourse_pour_annuler()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
  v_payment_status text;
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

  -- Etat COURANT: si la meme transaction a fait repartir la commande d'un
  -- autre statut, il n'y a plus d'annulation a juger.
  SELECT o.status, o.payment_status, o.total, o.tip_amount, o.tenant_id
    INTO v_status, v_payment_status, v_total, v_tip, v_tenant
    FROM public.orders o
   WHERE o.id = NEW.id;

  IF FOUND THEN
    IF v_status IS DISTINCT FROM 'cancelled' THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Ligne invisible ou supprimee dans la meme transaction: on juge sur la
    -- valeur ecrite. Ferme par defaut.
    v_payment_status := NEW.payment_status;
    v_total := NEW.total;
    v_tip := NEW.tip_amount;
    v_tenant := NEW.tenant_id;
  END IF;

  v_du := coalesce(v_total, 0) + coalesce(v_tip, 0);

  -- Meme calcul que exiger_registre_pour_paid (20261124100000).
  SELECT coalesce(sum(CASE WHEN p.status = 'refunded' THEN -p.amount
                           WHEN p.status = 'completed' THEN p.amount
                           ELSE 0 END), 0)
    INTO v_net
    FROM public.payments p
   WHERE p.order_id = NEW.id
     AND p.tenant_id = v_tenant;

  -- Regle 1: commande reglee. Il faut un remboursement, quel que soit le role.
  IF v_payment_status = 'paid' OR v_net >= greatest(v_du, 1) THEN
    RAISE EXCEPTION
      'Une commande payee ne s''annule pas: il faut d''abord la rembourser'
      USING ERRCODE = '42501',
            HINT = 'orders_annulation_exige_remboursement';
  END IF;

  -- Regle 2: de l'argent reste en caisse. Decision de l'autorite sur l'argent.
  IF v_net > 0 AND NOT public.has_tenant_money_permission(v_tenant) THEN
    RAISE EXCEPTION
      'Annuler une commande dont l''argent est encore en caisse exige l''autorite sur l''argent'
      USING ERRCODE = '42501',
            HINT = 'orders_annulation_exige_autorite_argent';
  END IF;

  RETURN NULL;
END;
$$;

-- Fonction de declencheur: personne n'a besoin de EXECUTE dessus.
REVOKE ALL ON FUNCTION public.exiger_registre_rembourse_pour_annuler() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exiger_registre_rembourse_pour_annuler() FROM anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_annulation_exige_registre_rembourse ON public.orders;
CREATE CONSTRAINT TRIGGER trg_annulation_exige_registre_rembourse
  AFTER UPDATE ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.exiger_registre_rembourse_pour_annuler();
