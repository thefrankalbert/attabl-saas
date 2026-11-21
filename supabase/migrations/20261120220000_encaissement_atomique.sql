-- Encaissement d'une commande en UNE transaction (relecture du lot pourboires,
-- 2026-11-20).
--
-- POURQUOI. `markPaid` (src/services/order/order-lifecycle.ts) ecrivait en deux
-- temps: bascule de la commande en payee, PUIS ligne au registre `payments`.
-- Si la ligne au registre echouait, `revertPaidFlip` devait remettre la
-- commande a encaisser. Or pour un caissier (sans l'autorite argent), cette
-- annulation ne peut PAS reussir:
--   - le declencheur `refuser_reecriture_montants_commande` remplace `paid_at`
--     par `now()` (20261107210000), donc le filtre `paid_at = <valeur du
--     client>` de l'annulation ne retrouve jamais la ligne;
--   - le meme declencheur refuse le retour de `paid` a `pending` sans
--     l'autorite argent.
-- Resultat: une commande payee SANS ligne au registre, absente du chiffre du
-- jour pour de bon, seulement journalisee.
--
-- CORRECTION. Les deux ecritures dans la meme fonction, donc la meme
-- transaction: si l'insertion au registre echoue, la bascule est annulee par
-- Postgres lui-meme. Plus rien a defaire a la main.
--
-- SECURITY INVOKER: la fonction n'eleve AUCUN droit. La RLS de `orders` et de
-- `payments`, la garde des montants et la garde du registre s'appliquent a
-- l'appelant exactement comme avant. Les filtres sont ceux de l'ancien UPDATE:
-- meme restaurant, commande encore `pending`, non annulee.
--
-- Le pourboire de la caisse s'AJOUTE a celui deja enregistre (constat B), dans
-- le meme UPDATE: pas de lecture-puis-ecriture. `p_tip_plafond` (unites
-- mineures de la devise de la commande, calcule par l'application) borne le
-- pourboire OBTENU (constat F).
--
-- Rejouable: CREATE OR REPLACE.
-- Rollback: DROP FUNCTION public.encaisser_commande(uuid, uuid, text, bigint, bigint);
-- puis redeployer l'ancien markPaid (deux ecritures).

BEGIN;

CREATE OR REPLACE FUNCTION public.encaisser_commande(
  p_order_id uuid,
  p_tenant_id uuid,
  p_method text,
  p_tip_ajout bigint DEFAULT 0,
  p_tip_plafond bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ligne record;
BEGIN
  IF coalesce(p_tip_ajout, 0) < 0 THEN
    RAISE EXCEPTION 'Pourboire negatif' USING ERRCODE = '22023';
  END IF;

  UPDATE public.orders o
     SET payment_method = p_method,
         payment_status = 'paid',
         paid_at = now(),
         tip_amount = coalesce(o.tip_amount, 0) + coalesce(p_tip_ajout, 0)
   WHERE o.id = p_order_id
     AND o.tenant_id = p_tenant_id
     AND o.payment_status = 'pending'
     -- Une commande annulee garde payment_status = 'pending'.
     AND o.status <> 'cancelled'
  RETURNING o.session_id, o.total, o.tip_amount INTO v_ligne;

  -- Rien de bascule: deja reglee (double appui, rejeu), annulee, ou hors de
  -- portee. Le rejeu reste un non-evenement.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('paid', false);
  END IF;

  IF p_tip_plafond IS NOT NULL AND coalesce(v_ligne.tip_amount, 0) > p_tip_plafond THEN
    RAISE EXCEPTION 'Pourboire trop eleve' USING ERRCODE = '22023';
  END IF;

  -- Registre: total (pourboire exclu) + pourboire. Une erreur ici annule aussi
  -- la bascule ci-dessus.
  INSERT INTO public.payments (tenant_id, order_id, amount, method, status)
  VALUES (p_tenant_id, p_order_id,
          coalesce(v_ligne.total, 0) + coalesce(v_ligne.tip_amount, 0),
          p_method, 'completed');

  RETURN jsonb_build_object('paid', true, 'session_id', v_ligne.session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.encaisser_commande(uuid, uuid, text, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encaisser_commande(uuid, uuid, text, bigint, bigint)
  TO authenticated, service_role;

COMMIT;
