-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B144 (Moyenne), B138 (Moyenne), et la
-- partie BASE de B68 (contre-audit 1, defaut 4).
-- Garde d'argent de `orders`: une annulation est definitive, et l'autorite
-- sur l'argent n'est demandee que pour OFFRIR ou REMBOURSER, plus pour faire
-- avancer en cuisine une commande deja offerte.
--
-- CE QUI NE TENAIT PAS.
-- B144. `refuser_argent_sans_orders_pay` traitait l'ENTREE dans l'etat
--   `cancelled` comme une operation d'argent, mais pas la SORTIE: `status` est
--   dans la liste blanche, donc un serveur ou un chef (sans `orders.pay`)
--   remettait en "en attente", par appel direct, une commande que le caissier
--   avait annulee. Le stock et le coupon avaient deja ete rendus: la commande
--   revenait sur la note, pouvait etre encaissee, le stock restait surevalue et
--   le coupon comptait une utilisation de moins. L'application ne fait JAMAIS
--   cette transition (`updateStatus` refuse de sortir de `cancelled`), et elle
--   ne remet ni le stock ni le coupon: elle est refusee a TOUT client
--   (`authenticated`, `anon`), quel que soit son droit.
-- B138. La politique UPDATE "Order managers can update own tenant orders"
--   exigeait l'autorite sur l'argent des que la ligne APRES modification etait
--   offerte ou remboursee. Une politique ne voit pas l'ancienne ligne: le chef
--   ne pouvait plus passer a "prete", ni le serveur a "servie", une commande
--   offerte ou remboursee avant d'etre servie (`new row violates row-level
--   security policy`), et la table n'etait pas liberee.
-- B68 (en base). L'application refuse d'annuler une commande payee, mais la
--   base laissait faire: un caissier (`orders.pay`, sans autorite sur
--   l'argent) passait par appel direct une commande `paid` en `cancelled`
--   (reproduit au contre-audit 1). Le chemin prevu pour une commande payee est
--   le remboursement (`record_refund`, qui la fait sortir de `paid`).
--
-- LA CORRECTION.
-- 0. B68: une commande `paid` ne passe pas a `cancelled` pour un client
--    (`authenticated`, `anon`), quel que soit son droit. Chemins legitimes
--    verifies: le seul UPDATE applicatif vers `cancelled` est `cancelOrder`
--    (session d'employe), qui refuse deja une commande payee et filtre
--    `payment_status` dans son UPDATE; aucun chemin n'annule une commande
--    payee apres remboursement sans qu'elle soit d'abord sortie de `paid`
--    (`refunded`/`partial`). service_role et postgres restent libres.
-- 1. Le `WITH CHECK` de la politique revient a `orders.manage` (comme le
--    USING). Aucune autre politique UPDATE permissive n'existe sur `orders`.
-- 2. La regle d'argent passe dans le declencheur BEFORE UPDATE existant, qui
--    voit OLD et NEW. Sans `has_tenant_money_permission`, sont refuses:
--    - rendre une commande offerte ou remboursee (`payment_status` vers
--      `comp`/`refunded`, ou `is_comp` vers vrai) - la regle d'avant;
--    - sur une commande DEJA offerte ou remboursee: changer une colonne hors
--      du suivi de cuisine (`status`, `served_at`, `server_id`, `updated_at`),
--      ou l'annuler. C'est exactement ce que refusait l'ancien WITH CHECK, sauf
--      le suivi de cuisine. L'annulation d'une commande offerte ou remboursee
--      reste reservee a l'autorite sur l'argent (regle du bouton d'annulation
--      du lot A, `CancelOrderButton.tsx`).
--    Ce qui ne bouge pas: tout le reste du corps, recopie du texte STOCKE en
--    production (lu le 2026-11-24, `lot-b2b1/prod-fonctions.sql`), la liste
--    blanche et le refus de l'annulation sans `orders.pay`.
--    SECURITY INVOKER (lit `current_user`), `search_path` inchange.
-- Objets du lot B150 (`exiger_registre_pour_paid`, `trg_paid_exige_registre_*`,
-- `refuser_reecriture_montants_commande`) NON touches.
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne. Le code en ligne ne
-- fait jamais sortir une commande de `cancelled` (CONFLICT dans
-- `updateStatus`), et la regle de l'offert est relachee, pas resserree, pour le
-- suivi de cuisine. Politique et declencheur changent dans la MEME transaction:
-- il n'existe aucun instant ou le WITH CHECK est relache sans la garde.
--
-- ROLLBACK: recreer la politique avec son ancien WITH CHECK
--   (has_tenant_write_permission(tenant_id, 'orders.manage') AND ((coalesce(
--   payment_status,'') NOT IN ('comp','refunded') AND coalesce(is_comp,false)
--   = false) OR has_tenant_money_permission(tenant_id)))
-- et le corps de `refuser_argent_sans_orders_pay` de prod-fonctions.sql
-- (= `20261109200000_argent_orders_pay.sql`).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.refuser_argent_sans_orders_pay()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- B138: la commande est-elle offerte ou remboursee, avant et apres.
  v_argent_avant boolean :=
    coalesce(OLD.payment_status, '') IN ('comp', 'refunded') OR coalesce(OLD.is_comp, false);
  v_argent_apres boolean :=
    coalesce(NEW.payment_status, '') IN ('comp', 'refunded') OR coalesce(NEW.is_comp, false);
  v_hors_cuisine boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- B144: une commande annulee ne revient pas. L'annulation a rendu le stock et
  -- le coupon; la sortir de `cancelled` ne les reprend pas. Aucun client, quel
  -- que soit son droit (l'application ne fait jamais cette transition).
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION
      'Une commande annulee ne peut pas revenir: creez une nouvelle commande'
      USING ERRCODE = '42501';
  END IF;

  -- B68: une commande payee ne s'annule pas; elle se rembourse.
  IF OLD.payment_status = 'paid'
     AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION
      'Une commande payee ne peut pas etre annulee: utilisez un remboursement'
      USING ERRCODE = '42501';
  END IF;

  -- LISTE BLANCHE, comme la section 10 pour `order_items`. Sans `orders.pay`,
  -- seules ces colonnes peuvent changer: faire avancer la commande (`status`,
  -- `served_at`), la prendre en charge (`server_id`), et `updated_at` que le
  -- declencheur update_orders_updated_at reecrit de toute facon. Une premiere
  -- version listait au contraire les colonnes INTERDITES: toute colonne
  -- oubliee restait ouverte au serveur par l'API directe, y compris
  -- `wave_checkout_id` et `orange_money_pay_token`, qui relient un paiement
  -- mobile a SA commande (les reecrire fait payer une commande par l'argent
  -- d'une autre). Une colonne ajoutee plus tard est gardee par defaut.
  -- Les seuls UPDATE applicatifs sous jeton d'employe sans `orders.pay`
  -- (order-lifecycle: status + served_at; assignment.service: server_id)
  -- n'ecrivent que ces colonnes.
  v_hors_cuisine :=
       (to_jsonb(NEW) - ARRAY['status', 'served_at', 'server_id', 'updated_at'])
         IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'served_at', 'server_id', 'updated_at']);

  IF (
       v_hors_cuisine
       -- Annuler une note impayee apres avoir pris l'argent est le
       -- detournement classique: l'annulation reste une operation d'argent.
       OR (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
     )
     -- Jugee sur le restaurant PROPRIETAIRE (OLD), comme les autres gardes.
     AND NOT public.has_tenant_write_permission(OLD.tenant_id, 'orders.pay')
  THEN
    RAISE EXCEPTION
      'Encaisser, annuler, changer la note d''une table ou mettre sur une ardoise exige le droit d''encaisser'
      USING ERRCODE = '42501';
  END IF;

  -- B138: offrir ou rembourser exige l'autorite sur l'argent (regle reprise de
  -- l'ancien WITH CHECK de la politique UPDATE). Sur une commande deja offerte
  -- ou remboursee, seul le suivi de cuisine reste libre: toute autre colonne,
  -- ou l'annulation, exige aussi cette autorite.
  IF (v_argent_avant OR v_argent_apres)
     AND (
       NOT v_argent_avant
       OR v_hors_cuisine
       OR (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
     )
     AND NOT public.has_tenant_money_permission(OLD.tenant_id)
  THEN
    RAISE EXCEPTION
      'Offrir, rembourser ou modifier une commande offerte ou remboursee exige l''autorite sur l''argent'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Order managers can update own tenant orders" ON public.orders;
CREATE POLICY "Order managers can update own tenant orders"
  ON public.orders
  FOR UPDATE
  USING (public.has_tenant_write_permission(tenant_id, 'orders.manage'))
  WITH CHECK (public.has_tenant_write_permission(tenant_id, 'orders.manage'));

COMMIT;
