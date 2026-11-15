-- Garde d'ecriture du registre des paiements: les BORNES valent pour TOUS les
-- roles, y compris ceux qui ont l'autorite sur l'argent (audit M-06 et M-07).
--
-- CE QUI RESTAIT OUVERT. La garde `garder_ecriture_registre_paiements`
-- (20261112135000) rendait la main des qu'elle voyait l'autorite sur l'argent
-- (`has_tenant_money_permission`: proprietaire, admin, gerant). Le contrat de
-- la PR #373 reconnait a cette autorite le droit de REMBOURSER et d'ENCAISSER
-- directement, mais il n'a jamais dit "sans limite". Resultat, par l'API
-- directe (cle anon du bundle + son propre jeton), pour un gerant:
--
--   M-06  inserer une ligne 'refunded' (ou 'completed' de montant negatif)
--         SUPERIEURE a ce qui avait ete encaisse net: la caisse "rendait" plus
--         d'argent qu'elle n'en avait recu. Le chemin applicatif
--         (record_refund) borne deja ce montant sous verrou; la garde, elle,
--         laissait passer l'insertion directe.
--   M-07  deux appareils qui encaissent en meme temps la meme commande: la
--         verification de `recordTender` est lue AVANT l'insertion, les deux
--         passent, et la commande a plus d'argent encaisse que de note a
--         regler. Pour un caissier la garde ferme deja ce cas (verrou de la
--         commande + borne); pour un gerant elle ne s'appliquait pas.
--
-- REGLE AJOUTEE, pour tout jeton d'utilisateur (authenticated/anon), quel que
-- soit son role. Soit v = +montant pour une ligne encaissee, -montant pour une
-- ligne 'refunded' (meme signe que le registre et que record_refund):
--   - v < 0 (remboursement, sous l'une ou l'autre forme): le montant rembourse
--     ne peut pas depasser le net deja encaisse (encaisse - rembourse).
--   - v > 0 (encaissement): la commande n'est ni annulee ni offerte, et
--     v ne peut pas depasser le solde du (total + pourboire - net).
-- Le net est lu APRES le verrou `FOR UPDATE` de la ligne de la commande, deja
-- pris par la garde: deux ecritures simultanees se serialisent, la seconde lit
-- le registre que la premiere vient de valider (READ COMMITTED relit a chaque
-- instruction). Aucune borne applicative ne remplace ce verrou.
--
-- Il n'existe pas de rendu de monnaie dans le registre: le montant enregistre
-- est le montant imputable a la note, jamais le billet tendu. Un
-- sur-encaissement volontaire n'a donc aucun chemin legitime, et
-- `recordTender` le refuse deja (meme message).
--
-- CHEMINS NON JUGES, inchanges: service_role (caisse POS, webhooks) et les
-- fonctions SECURITY DEFINER (record_refund, qui se borne elle-meme sous
-- verrou), ou current_user n'est ni authenticated ni anon.
--
-- Sans l'autorite sur l'argent le comportement est IDENTIQUE a 20261112135000
-- (memes refus, memes codes 42501 / 22023, dans le meme ordre).
--
-- SECURITY INVOKER: en DEFINER, current_user vaudrait toujours le proprietaire
-- et la garde ne se declencherait jamais.
--
-- ORDRE DE DEPLOIEMENT: aucune dependance avec le code. L'application refuse
-- deja ces montants; la migration est purement restrictive pour l'API
-- directe, donc elle peut etre appliquee avant ou apres le deploiement.
--
-- Rejouable (CREATE OR REPLACE FUNCTION; le declencheur existe deja depuis
-- 20261112135000 et appelle la fonction par son nom, il n'est pas recree).
--
-- REJEU IDEMPOTENT: une ligne qui porte une cle client_request_id deja
-- utilisee pour ce restaurant est laissee passer par la garde, pour que
-- l'index unique leve 23505 (le chemin applicatif le traite comme un rejeu,
-- voir recordTender et house-account-settlement). Sans cela, un doublon
-- concurrent recevrait 22023 au lieu de 23505.
--
-- Rollback (reposer le corps litteral de 20261112135000, le declencheur
-- trg_payments_insert_guard n'est pas touche par cette migration):
--
-- CREATE OR REPLACE FUNCTION public.garder_ecriture_registre_paiements()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY INVOKER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_order RECORD;
--   v_net NUMERIC;
--   v_author UUID;
-- BEGIN
--   IF current_user NOT IN ('authenticated', 'anon') THEN
--     RETURN NEW;
--   END IF;
--
--   IF NOT public.has_tenant_write_permission(NEW.tenant_id, 'orders.pay') THEN
--     RAISE EXCEPTION 'Enregistrer un paiement exige le droit d''encaisser'
--       USING ERRCODE = '42501';
--   END IF;
--
--   IF NEW.method IS NULL OR NEW.method NOT IN
--      ('cash', 'card', 'wave', 'orange_money', 'mtn_momo', 'free_money') THEN
--     RAISE EXCEPTION 'Moyen de paiement inconnu'
--       USING ERRCODE = '22023';
--   END IF;
--
--   SELECT au.id INTO v_author
--   FROM public.admin_users au
--   WHERE au.user_id = (SELECT auth.uid())
--     AND au.tenant_id = NEW.tenant_id
--     AND (au.is_active IS NULL OR au.is_active = true)
--     AND au.deleted_at IS NULL
--   LIMIT 1;
--   NEW.created_by := v_author;
--   NEW.created_at := now();
--
--   SELECT o.total, o.tip_amount, o.status, o.payment_status
--     INTO v_order
--   FROM public.orders o
--   WHERE o.id = NEW.order_id AND o.tenant_id = NEW.tenant_id
--   FOR UPDATE;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Commande introuvable pour ce restaurant'
--       USING ERRCODE = '42501';
--   END IF;
--
--   IF public.has_tenant_money_permission(NEW.tenant_id) THEN
--     RETURN NEW;
--   END IF;
--
--   IF NEW.status IS DISTINCT FROM 'completed' OR NEW.amount <= 0 THEN
--     RAISE EXCEPTION 'Rembourser exige l''autorite sur l''argent'
--       USING ERRCODE = '42501';
--   END IF;
--
--   IF v_order.status = 'cancelled' OR v_order.payment_status = 'comp' THEN
--     RAISE EXCEPTION 'Impossible d''encaisser une commande annulee ou offerte'
--       USING ERRCODE = '22023';
--   END IF;
--
--   SELECT COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0)
--     INTO v_net
--   FROM public.payments p
--   WHERE p.order_id = NEW.order_id AND p.tenant_id = NEW.tenant_id;
--
--   IF NEW.amount > (COALESCE(v_order.total, 0) + COALESCE(v_order.tip_amount, 0) - v_net) THEN
--     RAISE EXCEPTION 'Montant superieur au solde du'
--       USING ERRCODE = '22023';
--   END IF;
--
--   RETURN NEW;
-- END;
-- $function$;
--

BEGIN;

CREATE OR REPLACE FUNCTION public.garder_ecriture_registre_paiements()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_net NUMERIC;
  v_delta NUMERIC;
  v_author UUID;
  v_authority BOOLEAN;
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

  v_authority := public.has_tenant_money_permission(NEW.tenant_id);

  IF NOT v_authority THEN
    IF NEW.status IS DISTINCT FROM 'completed' OR NEW.amount <= 0 THEN
      RAISE EXCEPTION 'Rembourser exige l''autorite sur l''argent'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Rejeu: la cle existe deja, l'index unique leve 23505 apres la garde.
  IF NEW.client_request_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.tenant_id = NEW.tenant_id AND p.client_request_id = NEW.client_request_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Valeur signee de la ligne, comme dans le registre: + encaisse, - rembourse.
  v_delta := CASE WHEN NEW.status = 'refunded' THEN -NEW.amount ELSE NEW.amount END;

  IF v_delta > 0 AND (v_order.status = 'cancelled' OR v_order.payment_status = 'comp') THEN
    RAISE EXCEPTION 'Impossible d''encaisser une commande annulee ou offerte'
      USING ERRCODE = '22023';
  END IF;

  -- Net lu APRES le verrou de la commande (FOR UPDATE ci-dessus).
  SELECT COALESCE(SUM(CASE WHEN p.status = 'refunded' THEN -p.amount ELSE p.amount END), 0)
    INTO v_net
  FROM public.payments p
  WHERE p.order_id = NEW.order_id AND p.tenant_id = NEW.tenant_id;

  IF v_delta < 0 AND -v_delta > v_net THEN
    RAISE EXCEPTION 'Remboursement superieur au montant encaisse'
      USING ERRCODE = '22023', HINT = 'payments_bound_refund';
  END IF;

  IF v_delta > 0
     AND v_delta > (COALESCE(v_order.total, 0) + COALESCE(v_order.tip_amount, 0) - v_net) THEN
    RAISE EXCEPTION 'Montant superieur au solde du'
      USING ERRCODE = '22023', HINT = 'payments_bound_balance';
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
