-- Abonnement par mobile money et carte (Flutterwave): registre des paiements et
-- application ATOMIQUE d'un paiement a l'abonnement du restaurant.
--
-- Une ligne par TENTATIVE de paiement. Elle est creee AVANT l'appel a
-- Flutterwave et porte le prix attendu et le lien de paiement: c'est elle, et
-- non la reference ou le corps du webhook, qui dit ce que le restaurant devait
-- payer. Une tentative `pending` vit 7 jours (au-dela, elle n'est plus reutilisee
-- et un paiement tardif n'est applique que s'il couvre le prix ACTUEL).
--
-- Statuts:
--   pending              attente du paiement
--   successful           paiement applique a l'abonnement (periode ecrite)
--   rejected_conflict    paye alors qu'un abonnement Stripe vivant existe
--   rejected_plan_change paye pour un AUTRE plan alors que la periode en cours
--                        a plus d'un jour restant
--   rejected_expired     tentative de plus de 7 jours, payee moins que le prix actuel
--   rejected_blocked     restaurant suspendu par le super-admin, ou gele pour une
--                        cause qu'un paiement ne leve pas (litige, cause inconnue)
-- Les `rejected_*` portent l'identifiant Flutterwave: l'argent est PRIS et
-- n'a PAS ete applique. C'est le drapeau de remboursement (le code le journalise
-- en erreur). Rien n'est rembourse automatiquement.
--
-- Ecriture: service_role UNIQUEMENT (webhook, routes, cron). Lecture: les
-- proprietaires et administrateurs ACTIFS du restaurant.
--
-- Les fonctions sont SECURITY DEFINER, search_path vide, et EXECUTE est retire a
-- PUBLIC, anon et authenticated (les privileges par defaut du schema les leur
-- donnaient): seul service_role les appelle. Aucune colonne n'est ajoutee a
-- `tenants` (ses droits sont colonne par colonne).
--
-- Rollback:
--   DROP FUNCTION public.apply_flutterwave_payment(uuid, bigint, bigint, bigint, boolean, timestamptz);
--   DROP FUNCTION public.flutterwave_renewals_due(timestamptz, integer);
--   DROP FUNCTION public.flutterwave_freeze_overdue(timestamptz, interval, integer);
--   DROP TABLE public.flutterwave_payments;

BEGIN;

CREATE TABLE IF NOT EXISTS public.flutterwave_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tx_ref text NOT NULL,
  flw_transaction_id bigint,
  plan text NOT NULL,
  billing_interval text NOT NULL,
  -- Unites entieres: XOF et XAF n'ont pas de decimales.
  amount bigint NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  -- Lien de paiement heberge: permet de reutiliser une tentative non expiree.
  payment_link text,
  period_start timestamptz,
  period_end timestamptz,
  -- Rappels de renouvellement envoyes pour la periode que cette ligne a payee.
  -- Une colonne par rappel: l'ecriture est atomique, sans lecture-modification.
  reminder_d7_at timestamptz,
  reminder_d1_at timestamptz,
  -- Jour du mois sur lequel la periode est ancree: un abonnement commence un 31
  -- retombe sur le 31 apres un mois court (31 jan -> 28 fev -> 31 mars).
  anchor_day smallint,
  -- Derniere relecture chez Flutterwave d'une tentative `pending` (cron de
  -- rattrapage): fait tourner le lot, aucune ligne n'affame les autres.
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flutterwave_payments_tx_ref_key UNIQUE (tx_ref),
  CONSTRAINT flutterwave_payments_flw_transaction_id_key UNIQUE (flw_transaction_id),
  CONSTRAINT flutterwave_payments_plan_check CHECK (plan IN ('starter', 'pro', 'business')),
  CONSTRAINT flutterwave_payments_interval_check CHECK (billing_interval IN ('monthly', 'yearly')),
  CONSTRAINT flutterwave_payments_amount_check CHECK (amount > 0),
  CONSTRAINT flutterwave_payments_currency_check CHECK (currency IN ('XOF', 'XAF')),
  CONSTRAINT flutterwave_payments_status_check CHECK (
    status IN ('pending', 'successful', 'rejected_conflict', 'rejected_plan_change',
               'rejected_expired', 'rejected_blocked')
  ),
  -- Pas d'etat intermediaire ambigu: en attente = rien de regle; applique =
  -- transaction ET periode; rejete = transaction (l'argent est pris), jamais de periode.
  CONSTRAINT flutterwave_payments_etat_complet CHECK (
    (status = 'pending' AND flw_transaction_id IS NULL AND period_start IS NULL AND period_end IS NULL)
    OR (status = 'successful' AND flw_transaction_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL)
    OR (status LIKE 'rejected\_%' AND flw_transaction_id IS NOT NULL AND period_start IS NULL AND period_end IS NULL)
  )
);

COMMENT ON TABLE public.flutterwave_payments IS
  'Registre des paiements d abonnement Flutterwave (mobile money, carte). Une ligne par tentative, creee avant l appel a Flutterwave avec le prix attendu. Ecrit UNIQUEMENT par service_role.';

CREATE INDEX IF NOT EXISTS flutterwave_payments_tenant_status_period_idx
  ON public.flutterwave_payments (tenant_id, status, period_end);

ALTER TABLE public.flutterwave_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.flutterwave_payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.flutterwave_payments TO authenticated;
GRANT ALL ON TABLE public.flutterwave_payments TO service_role;

DROP POLICY IF EXISTS "Membres lisent les paiements Flutterwave de leur restaurant"
  ON public.flutterwave_payments;
DROP POLICY IF EXISTS "Proprietaires et admins lisent les paiements Flutterwave"
  ON public.flutterwave_payments;
CREATE POLICY "Proprietaires et admins lisent les paiements Flutterwave"
  ON public.flutterwave_payments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT au.tenant_id
        FROM public.admin_users au
       WHERE au.user_id = (SELECT auth.uid())
         AND COALESCE(au.is_active, true) = true
         AND au.role IN ('owner', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- Appliquer un paiement: UNE transaction, un verrou par ligne.
-- ---------------------------------------------------------------------------
-- Le code applicatif a deja RELU la transaction chez Flutterwave (statut, devise,
-- montant au moins egal a celui de la ligne, restaurant). Ici on decide et on
-- ecrit, sans fenetre entre "reserver le paiement" et "prolonger l'abonnement":
-- les deux ecritures reussissent ensemble ou aucune. Idempotente: un second appel
-- sur la meme ligne, ou sur la meme transaction Flutterwave, rend `duplicate`.
--
-- p_stripe_live: le code a verifie chez Stripe que l'abonnement attache au
--   restaurant VIT (statut autre que canceled / incomplete_expired).
-- p_current_price: prix ACTUEL du plan/periode de la ligne (source de verite
--   applicative), pour juger un paiement tardif sur une tentative expiree.
--
-- Rend un jsonb { outcome, period_start, period_end, unfrozen }.
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
    RETURN jsonb_build_object('outcome', 'duplicate');
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

-- ---------------------------------------------------------------------------
-- Echeances a relancer: filtrage COTE BASE (pas de limite qui affame).
-- ---------------------------------------------------------------------------
-- Restaurants actifs dont la derniere periode a ete payee par Flutterwave
-- (la ligne `successful` dont la fin egale la fin de periode du restaurant),
-- sans abonnement Stripe, a moins de 7 jours de l'echeance, et dont le rappel
-- de la fenetre n'est pas deja parti. Un restaurant deja relance sort du
-- resultat: la limite ne retient donc jamais les memes lignes.
CREATE OR REPLACE FUNCTION public.flutterwave_renewals_due(p_now timestamptz, p_limit integer)
RETURNS TABLE (
  payment_id uuid,
  tenant_id uuid,
  plan text,
  billing_interval text,
  period_end timestamptz,
  reminder text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.tenant_id, p.plan, p.billing_interval, p.period_end,
         CASE WHEN p.period_end <= p_now + interval '1 day' THEN 'd1' ELSE 'd7' END
    FROM public.flutterwave_payments p
    JOIN public.tenants t ON t.id = p.tenant_id
   WHERE p.status = 'successful'
     AND t.subscription_status = 'active'
     AND t.deleted_at IS NULL
     AND t.suspended_at IS NULL
     AND t.stripe_subscription_id IS NULL
     AND t.currency IN ('XOF', 'XAF')
     AND t.subscription_current_period_end = p.period_end
     AND p.period_end > p_now
     AND p.period_end <= p_now + interval '7 days'
     AND (
       (p.period_end <= p_now + interval '1 day' AND p.reminder_d1_at IS NULL)
       OR (p.period_end > p_now + interval '1 day' AND p.reminder_d7_at IS NULL)
     )
   ORDER BY p.period_end
   LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Gel apres le delai de grace, en UNE instruction.
-- ---------------------------------------------------------------------------
-- Gele les restaurants actifs dont la derniere periode PAYEE PAR FLUTTERWAVE est
-- finie depuis plus que le delai de grace. Un restaurant gele sort de la
-- selection (statut != active): pas de famine. Rend le nombre de gels.
CREATE OR REPLACE FUNCTION public.flutterwave_freeze_overdue(
  p_now timestamptz,
  p_grace interval,
  p_limit integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH due AS (
    SELECT t.id
      FROM public.tenants t
     WHERE t.subscription_status = 'active'
       AND t.deleted_at IS NULL
       AND t.stripe_subscription_id IS NULL
       AND t.subscription_current_period_end < p_now - p_grace
       AND EXISTS (
         SELECT 1 FROM public.flutterwave_payments p
          WHERE p.tenant_id = t.id
            AND p.status = 'successful'
            AND p.period_end = t.subscription_current_period_end
       )
     ORDER BY t.subscription_current_period_end
     LIMIT p_limit
       FOR UPDATE OF t SKIP LOCKED
  )
  UPDATE public.tenants t
     SET subscription_status = 'frozen', is_active = false, freeze_reason = 'flutterwave_unpaid'
    FROM due
   WHERE t.id = due.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_flutterwave_payment(uuid, bigint, bigint, bigint, boolean, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flutterwave_renewals_due(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flutterwave_freeze_overdue(timestamptz, interval, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_flutterwave_payment(uuid, bigint, bigint, bigint, boolean, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.flutterwave_renewals_due(timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.flutterwave_freeze_overdue(timestamptz, interval, integer) TO service_role;

COMMIT;
