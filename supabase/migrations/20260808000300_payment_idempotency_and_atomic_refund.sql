-- Encaissement: idempotence et remboursement atomique (constat F5, seconde moitie)
-- ============================================================================
-- La premiere moitie du correctif a pose un plafond applicatif: on refuse un
-- encaissement superieur au solde du. Ce plafond est un read-then-write. Il
-- arrete le double-clic SERIALISE, et rien d'autre: deux requetes reellement
-- concurrentes (retry HTTP automatique, tablette relancee, double-tap sur un
-- reseau lent) lisent toutes deux le meme solde, passent toutes deux le test, et
-- inserent toutes deux. Le mode de panne decrit dans le dossier reste ouvert
-- tant que la base ne tranche pas.
--
-- Deux verrous, tous deux cote base, parce qu'un garde-fou applicatif ne
-- serialise rien:
--
-- 1. IDEMPOTENCE. Colonne `client_request_id` + index unique partiel
--    (tenant_id, client_request_id). Meme patron que les commandes
--    (20260628010000_order_idempotency_key.sql): le client frappe une UUID
--    stable au moment du geste, la rejoue telle quelle en cas de retry, et la
--    base refuse la seconde insertion. Partiel, donc les lignes historiques et
--    les ecritures serveur sans cle restent permises.
--
-- 2. REMBOURSEMENT ATOMIQUE. `summarize` etait lu AVANT l'insertion: deux
--    remboursements concurrents du net total passaient tous deux le test
--    `amount > net` et sortaient DEUX FOIS l'argent de la caisse. C'est un
--    TOCTOU classique. La RPC verrouille la commande (SELECT ... FOR UPDATE) et
--    recalcule le net DANS la meme transaction que l'INSERT: le second
--    remboursement attend le premier, puis voit le net deja reduit et echoue.
--
-- Rollback:
--   drop function if exists public.record_refund(uuid, uuid, numeric, text, uuid, uuid);
--   drop index if exists uq_payments_tenant_client_request_id;
--   alter table public.payments drop column if exists client_request_id;
-- ============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

COMMENT ON COLUMN public.payments.client_request_id IS
  'Cle d''idempotence frappee par le client au moment du geste d''encaissement. Un rejeu porte la meme valeur et est refuse par l''index unique (F5).';

-- Partiel: les lignes existantes (NULL) et les ecritures serveur sans cle ne
-- sont pas contraintes entre elles.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_tenant_client_request_id
  ON public.payments (tenant_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Remboursement atomique
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_refund(
  p_order_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_method text,
  p_created_by uuid DEFAULT NULL,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total    numeric;
  v_tip      numeric;
  v_net      numeric;
  v_payment_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit etre superieur a zero'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Rejeu: la meme cle renvoie la ligne deja ecrite, sans second mouvement de
  -- caisse. Fait AVANT le verrou, un rejeu ne doit pas attendre.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_payment_id
    FROM payments
    WHERE tenant_id = p_tenant_id
      AND client_request_id = p_client_request_id;
    IF FOUND THEN
      RETURN v_payment_id;
    END IF;
  END IF;

  -- Le verrou porte sur la COMMANDE: il serialise tous les mouvements de caisse
  -- de cette commande, remboursements comme encaissements.
  SELECT total, COALESCE(tip_amount, 0)
    INTO v_total, v_tip
  FROM orders
  WHERE id = p_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable' USING ERRCODE = 'no_data_found';
  END IF;

  -- Net recalcule DANS la transaction, apres le verrou: c'est ce qui ferme le
  -- TOCTOU. Le second remboursement concurrent lit ici un net deja reduit.
  SELECT COALESCE(SUM(CASE WHEN status = 'refunded' THEN -amount ELSE amount END), 0)
    INTO v_net
  FROM payments
  WHERE order_id = p_order_id AND tenant_id = p_tenant_id;

  IF p_amount > v_net THEN
    RAISE EXCEPTION 'Le montant du remboursement depasse le montant encaisse'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO payments (tenant_id, order_id, amount, method, status, created_by, client_request_id)
  VALUES (p_tenant_id, p_order_id, p_amount, p_method, 'refunded', p_created_by, p_client_request_id)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$$;

-- Appelee par le service via le client authentifie: c'est la RPC qui porte la
-- garantie, pas l'appelant. anon n'a rien a faire ici.
REVOKE EXECUTE ON FUNCTION public.record_refund(uuid, uuid, numeric, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_refund(uuid, uuid, numeric, text, uuid, uuid) TO authenticated, service_role;
