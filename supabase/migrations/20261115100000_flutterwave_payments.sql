-- Abonnement par mobile money et carte (Flutterwave): registre des paiements.
--
-- Une ligne par TENTATIVE de paiement. Elle est creee AVANT l'appel a
-- Flutterwave et porte le prix attendu: c'est elle, et non la reference ou le
-- corps du webhook, qui dit ce que le restaurant devait payer. Elle passe de
-- `pending` a `successful` une seule fois, de facon atomique, ce qui rend le
-- webhook idempotent (un webhook rejoue, ou arrive en meme temps que la page de
-- retour, ne prolonge pas deux fois l'abonnement).
--
-- Ecriture: service_role UNIQUEMENT (webhook, route de lancement, cron). Aucun
-- role client n'a de droit d'ecriture, et la RLS n'ouvre aucune policy
-- d'ecriture. Lecture: les membres ACTIFS du restaurant, pour leurs lignes.
--
-- Aucune fonction n'est creee ici, donc rien a REVOKE cote EXECUTE. Aucune
-- colonne n'est ajoutee a `tenants` (ses droits sont colonne par colonne).
--
-- Rollback: DROP TABLE public.flutterwave_payments;

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
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT flutterwave_payments_tx_ref_key UNIQUE (tx_ref),
  CONSTRAINT flutterwave_payments_flw_transaction_id_key UNIQUE (flw_transaction_id),
  CONSTRAINT flutterwave_payments_plan_check CHECK (plan IN ('starter', 'pro', 'business')),
  CONSTRAINT flutterwave_payments_interval_check CHECK (billing_interval IN ('monthly', 'yearly')),
  CONSTRAINT flutterwave_payments_amount_check CHECK (amount > 0),
  CONSTRAINT flutterwave_payments_currency_check CHECK (currency IN ('XOF', 'XAF')),
  CONSTRAINT flutterwave_payments_status_check CHECK (status IN ('pending', 'successful')),
  -- Une ligne reglee porte son identifiant Flutterwave et sa periode, une ligne
  -- en attente n'en porte aucun: pas d'etat intermediaire ambigu.
  CONSTRAINT flutterwave_payments_reglee_complete CHECK (
    (status = 'pending' AND flw_transaction_id IS NULL AND period_start IS NULL AND period_end IS NULL)
    OR (status = 'successful' AND flw_transaction_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL)
  )
);

COMMENT ON TABLE public.flutterwave_payments IS
  'Registre des paiements d abonnement Flutterwave (mobile money, carte). Une ligne par tentative, creee avant l appel a Flutterwave avec le prix attendu. Ecrit UNIQUEMENT par service_role.';

CREATE INDEX IF NOT EXISTS flutterwave_payments_tenant_id_idx
  ON public.flutterwave_payments (tenant_id, created_at DESC);

ALTER TABLE public.flutterwave_payments ENABLE ROW LEVEL SECURITY;

-- Les privileges par defaut du schema donnent tout a anon et authenticated:
-- on retire tout, puis on rend uniquement la lecture.
REVOKE ALL ON TABLE public.flutterwave_payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.flutterwave_payments TO authenticated;
GRANT ALL ON TABLE public.flutterwave_payments TO service_role;

DROP POLICY IF EXISTS "Membres lisent les paiements Flutterwave de leur restaurant"
  ON public.flutterwave_payments;
CREATE POLICY "Membres lisent les paiements Flutterwave de leur restaurant"
  ON public.flutterwave_payments
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
