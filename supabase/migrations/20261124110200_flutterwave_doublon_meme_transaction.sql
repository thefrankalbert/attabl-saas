-- ============================================================================
-- Audit B148 (Haute): `apply_flutterwave_payment` ne repond plus "doublon" a une
-- AUTRE transaction Flutterwave.
--
-- CE QUI NE TENAIT PAS. Quand la tentative de paiement n'est plus `pending`, la
-- fonction repondait `duplicate`, que la transaction presentee soit celle deja
-- appliquee (rejeu ordinaire d'un webhook) ou une AUTRE transaction (le client a
-- paye deux fois sur le meme lien). Le service relit la ligne avant d'appeler la
-- fonction et ecarte deja le cas sequentiel, mais en cas de course (deux
-- webhooks, ou un webhook et la page de retour, lisent tous deux la ligne
-- encore `pending`), le second appel arrive ici sur une ligne `successful`:
-- `duplicate`, aucun journal "remboursement a faire", et le cron de rattrapage
-- ne revoit jamais la ligne. Le client a paye deux fois, personne n'est prevenu.
--
-- LA CORRECTION. Sur une ligne deja reglee, `duplicate` seulement si
-- `flw_transaction_id` est celui presente. Sinon, nouvelle issue
-- `already_settled_by_other_transaction`: rien n'est ecrit (la ligne garde la
-- transaction qui l'a reglee, la contrainte UNIQUE sur `flw_transaction_id`
-- interdit d'en poser une seconde), et le service la traite comme les autres
-- refus: journal "paiement encaisse mais NON applique, remboursement a faire".
-- Une ligne non `pending` porte toujours un `flw_transaction_id` (contrainte
-- `flutterwave_payments_etat_complet`), donc la comparaison est toujours definie.
--
-- Corps repris du texte STOCKE en production (lu le 2026-11-23, identique a
-- `20261115100000_flutterwave_payments.sql`). Seul le premier test de statut
-- change. Meme signature, meme type de retour, SECURITY DEFINER,
-- `search_path = ''`, memes droits (EXECUTE a service_role seulement).
--
-- ORDRE DE DEPLOIEMENT: APRES le code. Le service en ligne ne connait pas la
-- nouvelle issue: il leverait "Reponse inattendue" (webhook en 500, relance de
-- Flutterwave) au lieu d'ecrire le journal de remboursement. Le nouveau code,
-- lui, fonctionne avec l'ancienne comme avec la nouvelle fonction.
--
-- ROLLBACK: rejouer la definition de `20261115100000_flutterwave_payments.sql`
-- (APRES avoir verifie qu'aucune ligne ne depend de la nouvelle issue: elle
-- n'ecrit rien en base).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_flutterwave_payment(
  p_payment_id uuid,
  p_flw_transaction_id bigint,
  p_paid_amount bigint,
  p_current_price bigint,
  p_stripe_live boolean,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pay public.flutterwave_payments%ROWTYPE;
  v_t public.tenants%ROWTYPE;
  v_base timestamptz;
  v_end timestamptz;
  v_anchor integer;
  v_ts timestamp;
  v_first timestamp;
  v_last integer;
  v_unfreezable text[] := ARRAY[
    'trial_expired', 'past_due_overdue', 'stripe_unpaid',
    'subscription_deleted', 'refund', 'flutterwave_unpaid'
  ];
BEGIN
  SELECT * INTO v_pay FROM public.flutterwave_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'unknown_payment');
  END IF;
  IF v_pay.status <> 'pending' THEN
    -- Meme transaction rejouee: doublon ordinaire. Une AUTRE transaction sur une
    -- tentative deja reglee: argent pris, rien a appliquer, remboursement a faire.
    IF v_pay.flw_transaction_id = p_flw_transaction_id THEN
      RETURN jsonb_build_object('outcome', 'duplicate');
    END IF;
    RETURN jsonb_build_object('outcome', 'already_settled_by_other_transaction');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.flutterwave_payments
     WHERE flw_transaction_id = p_flw_transaction_id AND id <> p_payment_id
  ) THEN
    RETURN jsonb_build_object('outcome', 'duplicate');
  END IF;

  SELECT * INTO v_t FROM public.tenants WHERE id = v_pay.tenant_id FOR UPDATE;
  IF NOT FOUND OR v_t.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'tenant_not_found');
  END IF;

  -- Un abonnement Stripe vivant: on n'encaisse pas deux fois la meme periode.
  IF p_stripe_live OR (
    v_t.stripe_subscription_id IS NOT NULL
    AND v_t.subscription_status IN ('trial', 'active', 'past_due')
  ) THEN
    UPDATE public.flutterwave_payments
       SET status = 'rejected_conflict', flw_transaction_id = p_flw_transaction_id
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('outcome', 'rejected_conflict');
  END IF;

  -- Autre plan alors que plus d'un jour reste a courir: refuse (changement a l'echeance).
  IF v_t.subscription_status = 'active'
     AND v_t.subscription_plan <> v_pay.plan
     AND v_t.subscription_current_period_end > p_now + interval '1 day' THEN
    UPDATE public.flutterwave_payments
       SET status = 'rejected_plan_change', flw_transaction_id = p_flw_transaction_id
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('outcome', 'rejected_plan_change');
  END IF;

  -- Tentative expiree: un paiement tardif doit couvrir le prix actuel.
  IF v_pay.created_at < p_now - interval '7 days' AND p_paid_amount < p_current_price THEN
    UPDATE public.flutterwave_payments
       SET status = 'rejected_expired', flw_transaction_id = p_flw_transaction_id
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('outcome', 'rejected_expired');
  END IF;

  -- Suspendu par le super-admin, ou gele pour une cause qu'un paiement ne leve
  -- pas (litige, cause inconnue): on n'encaisse pas pour un acces qui restera
  -- ferme. L'argent est pris: drapeau de remboursement, rien n'est applique.
  IF v_t.suspended_at IS NOT NULL OR (
    v_t.subscription_status = 'frozen'
    AND NOT (coalesce(v_t.freeze_reason, '') = ANY (v_unfreezable))
  ) THEN
    UPDATE public.flutterwave_payments
       SET status = 'rejected_blocked', flw_transaction_id = p_flw_transaction_id
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('outcome', 'rejected_blocked');
  END IF;

  -- Debut de periode: essai en cours = ses jours restants sont conserves; meme
  -- plan = fin de periode en cours (aucun jour perdu); autre plan (admis
  -- seulement a moins d'un jour de l'echeance, ou sans periode payee) = maintenant.
  v_base := p_now;
  IF v_t.subscription_status = 'trial' AND v_t.trial_ends_at IS NOT NULL THEN
    v_base := greatest(v_base, v_t.trial_ends_at);
  ELSIF v_t.subscription_plan = v_pay.plan AND v_t.subscription_current_period_end IS NOT NULL THEN
    v_base := greatest(v_base, v_t.subscription_current_period_end);
  END IF;

  -- Fin de periode ANCREE sur le jour du premier mois: la periode qui suit une
  -- periode contigue garde son jour d'ancrage (31 jan -> 28 fev -> 31 mars).
  v_anchor := coalesce(
    (SELECT p.anchor_day FROM public.flutterwave_payments p
      WHERE p.tenant_id = v_t.id AND p.status = 'successful' AND p.period_end = v_base
      ORDER BY p.created_at DESC LIMIT 1),
    extract(day FROM (v_base AT TIME ZONE 'UTC'))::int
  );
  v_ts := v_base AT TIME ZONE 'UTC';
  v_first := date_trunc('month', v_ts)
    + CASE v_pay.billing_interval WHEN 'yearly' THEN interval '12 months' ELSE interval '1 month' END;
  v_last := extract(day FROM (v_first + interval '1 month' - interval '1 day'))::int;
  v_end := ((v_first::date + (least(v_anchor, v_last) - 1)) + v_ts::time) AT TIME ZONE 'UTC';

  UPDATE public.tenants SET
    subscription_plan = v_pay.plan,
    billing_interval = v_pay.billing_interval,
    subscription_current_period_start = v_base,
    subscription_current_period_end = v_end,
    -- L'identifiant Stripe restant ici est celui d'un abonnement MORT (verifie).
    stripe_subscription_id = NULL,
    subscription_status = 'active',
    is_active = true,
    past_due_since = NULL,
    freeze_reason = NULL
  WHERE id = v_t.id;

  UPDATE public.flutterwave_payments
     SET status = 'successful', flw_transaction_id = p_flw_transaction_id,
         period_start = v_base, period_end = v_end, anchor_day = v_anchor
   WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'outcome', 'applied',
    'period_start', v_base,
    'period_end', v_end,
    'unfrozen', v_t.subscription_status = 'frozen'
  );
END;
$$;

-- Memes droits que la production: {postgres=X, service_role=X}.
REVOKE ALL ON FUNCTION public.apply_flutterwave_payment(uuid, bigint, bigint, bigint, boolean, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_flutterwave_payment(uuid, bigint, bigint, bigint, boolean, timestamptz)
  TO service_role;
