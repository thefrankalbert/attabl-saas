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
-- le meme UPDATE: pas de lecture-puis-ecriture. Le plafond du pourboire OBTENU
-- (constat F) est calcule ICI, depuis la devise de la commande: 1 000 000 en
-- unites majeures (MAX_TIP_AMOUNT de src/lib/validations/order.schema.ts),
-- soit 1 000 000 en XAF/XOF (sans decimales) et 100 000 000 centimes en
-- EUR/USD. Un parametre se contournait par un appel direct avec NULL.
--
-- DROITS. Un employe sans `orders.pay` (serveur, chef par defaut) est refuse
-- explicitement (42501) au lieu d'un "rien n'a bascule" silencieux. Le role
-- service (route caisse) n'est pas concerne: il a deja ete controle.
--
-- RIEN N'A BASCULE. La fonction renvoie l'etat de reglement de la commande
-- (`payment_status`): l'application distingue une commande deja reglee (rejeu,
-- sans effet) d'une commande partiellement payee, qu'on solde depuis son
-- detail et non ici.
--
-- Rejouable: CREATE OR REPLACE.
-- Rollback: DROP FUNCTION public.encaisser_commande(uuid, uuid, text, bigint);
-- puis redeployer l'ancien markPaid (deux ecritures).

BEGIN;

CREATE OR REPLACE FUNCTION public.encaisser_commande(
  p_order_id uuid,
  p_tenant_id uuid,
  p_method text,
  p_tip_ajout bigint DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ligne record;
  v_etat text;
BEGIN
  IF coalesce(p_tip_ajout, 0) < 0 THEN
    RAISE EXCEPTION 'Pourboire negatif' USING ERRCODE = '22023';
  END IF;

  IF current_user IN ('authenticated', 'anon')
     AND NOT public.has_tenant_write_permission(p_tenant_id, 'orders.pay')
  THEN
    RAISE EXCEPTION 'Encaissement non autorise' USING ERRCODE = '42501';
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
  RETURNING o.session_id, o.total, o.tip_amount, o.display_currency INTO v_ligne;

  -- Rien de bascule: deja reglee (double appui, rejeu), partiellement payee,
  -- annulee, ou hors de portee. L'etat dit lequel (NULL = invisible).
  IF NOT FOUND THEN
    SELECT o.payment_status INTO v_etat
      FROM public.orders o
     WHERE o.id = p_order_id AND o.tenant_id = p_tenant_id;
    RETURN jsonb_build_object('paid', false, 'payment_status', v_etat);
  END IF;

  -- Parentheses obligatoires: sans elles, PL/pgSQL coupe la condition du IF
  -- au premier THEN, celui du CASE.
  IF coalesce(v_ligne.tip_amount, 0) >
       (CASE WHEN v_ligne.display_currency IN ('EUR', 'USD') THEN 100000000 ELSE 1000000 END)
  THEN
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

REVOKE ALL ON FUNCTION public.encaisser_commande(uuid, uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encaisser_commande(uuid, uuid, text, bigint)
  TO authenticated, service_role;

COMMIT;
