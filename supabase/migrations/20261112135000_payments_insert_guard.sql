-- Garde d'ecriture du registre des paiements, AVANT qu'il devienne la source
-- du chiffre d'affaires (20261112140000, audit C-041).
--
-- POURQUOI. La politique `payments_tenant_insert` (relue en production le
-- 2026-11-12) exige deja le droit d'encaisser et, sans l'autorite sur
-- l'argent, une ligne 'completed' de montant positif. Elle laissait passer,
-- mesure sur le banc en retirant cette garde: un caissier qui encaisse une
-- commande ANNULEE, une commande d'un AUTRE restaurant (ligne au nom du
-- sien), ou un montant AU-DELA du solde (999 999 sur une note de 10 000), et
-- toute ligne antidatee ou attribuee a un autre employe. Tant que le chiffre
-- venait du statut des commandes, ces lignes ne comptaient pas. Des que le
-- chiffre se lit dans le registre (20261112140000), elles le falsifient.
-- Signale par la revue de securite automatique du 2026-11-12; corrige avant
-- toute mise en production.
--
-- REGLE, pour les jetons d'utilisateur seulement (authenticated/anon). Les
-- chemins de confiance passent sans changement: service_role (caisse POS,
-- webhooks) et les fonctions SECURITY DEFINER (record_refund), ou
-- current_user vaut leur proprietaire.
-- Pour tous:
--   1. Il faut le droit d'encaisser du restaurant de la ligne (orders.pay).
--   2. Le moyen de paiement est l'un des 6 connus (src/lib/payments/methods.ts,
--      meme liste que la contrainte tenants_enabled_payment_methods_known).
--   3. La date et l'auteur ne viennent pas du client: created_at := now(),
--      created_by := la fiche employe de la personne connectee.
--   4. La commande existe et appartient au restaurant de la ligne.
-- Sans l'autorite sur l'argent (has_tenant_money_permission: le caissier):
--   5. Pas de remboursement (ligne 'refunded', montant negatif ou nul):
--      42501, comme la politique d'insertion.
--   6. Commande ni annulee ni offerte ('comp': jamais au registre).
--   7. Montant au plus le solde du (total + pourboire - net deja encaisse).
--      La ligne de la commande est verrouillee (FOR UPDATE) pour que deux
--      encaissements simultanes ne passent pas tous les deux. Les chemins
--      applicatifs respectent deja cette borne (recordTender refuse le
--      depassement; markPaid et la caisse ecrivent le total exact sur une
--      commande qui n'avait rien encaisse).
-- Avec cette autorite (gerant, admin, proprietaire), 5 a 7 ne s'appliquent
-- pas: le contrat de supabase/tests/rls/garde_argent.test.sql (PR #373) lui
-- reconnait le droit de rembourser directement, y compris par un montant
-- negatif.
--
-- NON RETENU, revue de securite du 2026-11-12: borner le montant sur des
-- valeurs que le caissier ne peut pas changer (pourboire plafonne). Le
-- caissier a le droit d'encaisser (orders.pay), qui l'autorise deja a fixer
-- la note et le pourboire d'une commande (trg_argent_exige_orders_pay ne
-- garde ces colonnes que pour qui N'A PAS ce droit). Gonfler la note puis
-- l'encaisser ne fait qu'ajouter au chiffre de l'argent qu'il devrait
-- presenter en caisse: aucun gain pour lui. Le sens qui lui profiterait
-- (faire baisser le chiffre) passe par un remboursement, refuse ici.
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
  v_author UUID;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_tenant_write_permission(NEW.tenant_id, 'orders.pay') THEN
    RAISE EXCEPTION 'Enregistrer un paiement exige le droit d''encaisser'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.method IS NULL OR NEW.method NOT IN
     ('cash', 'card', 'wave', 'orange_money', 'mtn_momo', 'free_money') THEN
    RAISE EXCEPTION 'Moyen de paiement inconnu'
      USING ERRCODE = '22023';
  END IF;

  SELECT au.id INTO v_author
  FROM public.admin_users au
  WHERE au.user_id = (SELECT auth.uid())
    AND au.tenant_id = NEW.tenant_id
    AND (au.is_active IS NULL OR au.is_active = true)
    AND au.deleted_at IS NULL
  LIMIT 1;
  NEW.created_by := v_author;
  NEW.created_at := now();

  SELECT o.total, o.tip_amount, o.status, o.payment_status
    INTO v_order
  FROM public.orders o
  WHERE o.id = NEW.order_id AND o.tenant_id = NEW.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable pour ce restaurant'
      USING ERRCODE = '42501';
  END IF;

  IF public.has_tenant_money_permission(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'completed' OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Rembourser exige l''autorite sur l''argent'
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

  IF NEW.amount > (COALESCE(v_order.total, 0) + COALESCE(v_order.tip_amount, 0) - v_net) THEN
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
