-- ============================================================================
-- Audit verif-prod SM10 et SM8 (Moyenne): registre des ANOMALIES Flutterwave.
--
-- CE QUI NE TENAIT PAS. Quand un client paie mais que rien ne s'applique, la
-- seule trace etait parfois un `logger.error` "remboursement a faire":
--   - seconde transaction sur une reference deja reglee (le client a paye deux
--     fois sur le meme lien): la contrainte UNIQUE de `flutterwave_payments`
--     interdit d'y ecrire une seconde transaction, donc rien en base;
--   - sous-paiement, mauvaise devise, reference inconnue, restaurant supprime:
--     la ligne reste `pending` ou n'existe pas, rien en base;
--   - et aucun rapprochement ne comparait ce que Flutterwave a encaisse avec
--     ce que la base a applique (seules les lignes `pending` etaient relues).
-- Un journal se perd: le proprietaire de la plateforme ne pouvait pas dresser
-- la liste de ce qu'il doit rembourser.
--
-- LA CORRECTION. Une table dediee, ecrite par le service (service_role) au
-- moment ou l'anomalie est vue (webhook, page de retour, tache de rattrapage):
--   kind = 'refund_due'             argent encaisse, rien applique: a rembourser
--          'provider_mismatch'      Flutterwave ne confirme plus une transaction
--                                   que la base tient pour reglee (statut, montant,
--                                   devise ou reference differents)
--          'paid_period_not_active' periode payee en cours, mais le restaurant
--                                   n'est pas actif sur cette periode
--   reason = la raison applicative (ex: ALREADY_SETTLED_BY_OTHER_TRANSACTION).
-- UNIQUE (flw_transaction_id, kind): un webhook rejoue ou le passage suivant de
-- la tache n'ajoutent pas de doublon.
--
-- ISOLATION. Ces lignes sont des donnees de la PLATEFORME (montants a
-- rembourser, identifiants de transaction): lisibles par le super
-- administrateur et par service_role SEULEMENT. Un proprietaire de restaurant
-- n'y lit rien (il voit deja ses propres tentatives dans `flutterwave_payments`).
-- Aucune ecriture par l'API: ni anon, ni authenticated.
--
-- Les cles etrangeres sont en ON DELETE SET NULL: la suppression d'un restaurant
-- ou d'une tentative ne doit pas effacer une dette de remboursement.
--
-- ORDRE DE DEPLOIEMENT: AVANT le code. Migration purement additive (nouvelle
-- table), sans effet sur le code en ligne. Le nouveau code ecrit dans cette
-- table et repond 500 (Flutterwave relance) si elle manque.
--
-- ROLLBACK (apres avoir exporte les lignes non resolues):
--   DROP TABLE public.flutterwave_anomalies;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.flutterwave_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.flutterwave_payments(id) ON DELETE SET NULL,
  flw_transaction_id bigint NOT NULL,
  tx_ref text,
  kind text NOT NULL,
  reason text NOT NULL,
  -- Montant ENCAISSE selon Flutterwave (pas le prix attendu): c'est ce qu'on rembourse.
  amount numeric,
  currency text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text,
  CONSTRAINT flutterwave_anomalies_kind_check CHECK (
    kind IN ('refund_due', 'provider_mismatch', 'paid_period_not_active')
  ),
  CONSTRAINT flutterwave_anomalies_reason_check CHECK (length(reason) BETWEEN 1 AND 200),
  CONSTRAINT flutterwave_anomalies_amount_check CHECK (amount IS NULL OR amount >= 0),
  CONSTRAINT flutterwave_anomalies_unique UNIQUE (flw_transaction_id, kind)
);

COMMENT ON TABLE public.flutterwave_anomalies IS
  'Anomalies d encaissement Flutterwave (remboursements dus, ecarts avec le prestataire). Ecrit par service_role, lu par le super administrateur seulement.';

-- Index des cles etrangeres (convention du depot) et de la liste a traiter.
CREATE INDEX IF NOT EXISTS flutterwave_anomalies_tenant_id_idx
  ON public.flutterwave_anomalies (tenant_id);
CREATE INDEX IF NOT EXISTS flutterwave_anomalies_payment_id_idx
  ON public.flutterwave_anomalies (payment_id);
CREATE INDEX IF NOT EXISTS flutterwave_anomalies_non_resolues_idx
  ON public.flutterwave_anomalies (detected_at) WHERE resolved_at IS NULL;

ALTER TABLE public.flutterwave_anomalies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.flutterwave_anomalies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.flutterwave_anomalies TO authenticated;
GRANT ALL ON TABLE public.flutterwave_anomalies TO service_role;

DROP POLICY IF EXISTS "Super admin: lecture des anomalies Flutterwave"
  ON public.flutterwave_anomalies;
CREATE POLICY "Super admin: lecture des anomalies Flutterwave"
  ON public.flutterwave_anomalies
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_super_admin()));

COMMIT;
