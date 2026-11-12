-- Garde d'ecriture du registre des paiements, AVANT qu'il devienne la source
-- du chiffre d'affaires (20261112140000, audit C-041).
--
-- POURQUOI. La politique `payments_tenant_insert` (relue en production le
-- 2026-11-12) exige deja le droit d'encaisser et le statut 'completed' (sauf
-- pour un gerant). Elle laissait passer, mesure sur le banc en retirant cette
-- garde: un caissier qui encaisse une commande ANNULEE, une commande d'un
-- AUTRE restaurant (ligne au nom du sien), ou un montant AU-DELA du solde
-- (999 999 sur une note de 10 000); et un gerant qui ecrit un remboursement
-- directement, sans les controles de record_refund. Tant que le chiffre venait
-- du statut des commandes, ces lignes ne comptaient pas. Des que le chiffre
-- se lit dans le registre (20261112140000), elles le falsifient. Signale par
-- la revue de securite automatique du 2026-11-12; corrige avant toute mise en
-- production.
--
-- REGLE, pour les jetons d'utilisateur seulement (authenticated/anon). Les
-- chemins de confiance passent sans changement: service_role (caisse POS,
-- webhooks) et les fonctions SECURITY DEFINER (record_refund), ou
-- current_user vaut leur proprietaire.
--   1. Il faut le droit d'encaisser du restaurant de la ligne (orders.pay).
--   2. La commande existe et appartient a ce restaurant.
--   3. Elle n'est ni annulee ni offerte ('comp': jamais au registre).
--   4. Un remboursement ne s'ecrit que par record_refund (qui verifie le
--      montant deja paye): une ligne 'refunded' directe est refusee.
--   5. Un encaissement ne depasse pas le solde du (total + pourboire - net
--      deja encaisse). La ligne de la commande est verrouillee (FOR UPDATE)
--      pour que deux encaissements simultanes ne passent pas tous les deux.
--      Les chemins applicatifs respectent deja cette borne (recordTender
--      refuse le depassement; markPaid et la caisse ecrivent le total exact
--      sur une commande qui n'avait rien encaisse).
--
-- SECURITY INVOKER: en DEFINER, current_user vaudrait toujours le
-- proprietaire et la garde ne se declencherait jamais (piege releve le
-- 2026-11-08 sur une garde de la meme famille).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_payments_insert_guard ON public.payments;
--   DROP FUNCTION IF EXISTS public.garder_ecriture_registre_paiements();

CREATE OR REPLACE FUNCTION public.garder_ecriture_registre_paiements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_net NUMERIC;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_tenant_write_permission(NEW.tenant_id, 'orders.pay') THEN
    RAISE EXCEPTION 'Enregistrer un paiement exige le droit d''encaisser'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Un remboursement passe par la fonction de remboursement'
      USING ERRCODE = '42501';
  END IF;

  SELECT o.total, o.tip_amount, o.status, o.payment_status
    INTO v_order
  FROM public.orders o
  WHERE o.id = NEW.order_id AND o.tenant_id = NEW.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable pour ce restaurant'
      USING ERRCODE = '42501';
  END IF;

  IF v_order.status = 'cancelled' OR v_order.payment_status = 'comp' THEN
    RAISE EXCEPTION 'Impossible d''encaisser une commande annulee ou offerte'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0)
    INTO v_net
  FROM public.payments p
  WHERE p.order_id = NEW.order_id AND p.tenant_id = NEW.tenant_id;

  IF NEW.amount <= 0
     OR NEW.amount > (COALESCE(v_order.total, 0) + COALESCE(v_order.tip_amount, 0) - v_net) THEN
    RAISE EXCEPTION 'Montant superieur au solde du'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payments_insert_guard ON public.payments;
CREATE TRIGGER trg_payments_insert_guard
  BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.garder_ecriture_registre_paiements();
