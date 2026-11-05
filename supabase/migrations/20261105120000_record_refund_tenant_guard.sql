-- ============================================================================
-- record_refund: la fonction faisait confiance a son appelant sur un chemin
-- de remboursement.
-- ============================================================================
--
-- CE QUI ETAIT OUVERT (mesure sur la base de production le 2026-11-05, pas lu
-- dans un fichier):
--
--   record_refund       SECURITY DEFINER = true
--   EXECUTE accorde a   authenticated
--   assert_tenant_member dans le corps = NON
--   auth.uid() dans le corps            = NON
--
-- La fonction recevait `p_tenant_id` et `p_created_by` de l'appelant et les
-- utilisait tels quels. Comme elle est SECURITY DEFINER, elle s'execute avec
-- les droits du proprietaire: la RLS de `payments` et de `orders` ne s'applique
-- pas a l'interieur. Deux consequences:
--
--   1. CROISEMENT DE LOCATAIRES. Tout compte `authenticated` pouvait appeler
--      /rest/v1/rpc/record_refund en direct avec le `tenant_id` d'un AUTRE
--      restaurant et un `order_id` de ce restaurant, et ecrire un remboursement
--      dans sa caisse. L'id de commande n'est pas devinable, mais il circule
--      (tickets, QR, reponses d'API): ce n'est pas un secret, c'est un
--      identifiant.
--   2. FALSIFICATION DE LA PISTE D'AUDIT. `p_created_by` etant pris tel quel,
--      un membre pouvait attribuer SON remboursement a un collegue - y compris
--      dans son propre restaurant.
--
-- POURQUOI LE TROU EXISTAIT MALGRE UNE ACTION SERVEUR GARDEE. L'unique chemin
-- applicatif, `actionRefundOrder` (src/app/actions/orders.ts), appelle bien
-- `getAuthenticatedUserForTenant(tenantId, ['owner','admin','manager'],
-- 'orders.manage')`. Mais une RPC avec EXECUTE a `authenticated` est joignable
-- DIRECTEMENT par l'API REST de Supabase, avec le jeton de n'importe quel
-- compte connecte. La garde applicative ne protege que ceux qui passent par la
-- porte; celle-ci n'etait pas la seule.
--
-- CE QUE CETTE MIGRATION CHANGE. Elle remplace le corps de la fonction, sans
-- toucher a sa signature: aucun appelant n'est a modifier.
--
--   - appartenance: `assert_tenant_member(p_tenant_id)` en PREMIERE instruction
--     (avant meme la validation du montant: on ne renseigne pas un etranger sur
--     la validite de ses parametres). Cette aide existait deja en base et gere
--     `service_role` et les super-admins.
--   - habilitation: le role et la permission `orders.manage` du membre sont
--     verifies, en refletant EXACTEMENT la regle de l'action serveur (voir le
--     bloc ci-dessous).
--   - piste d'audit: `created_by` est DERIVE de `auth.uid()` et non plus recu.
--     Pour le chemin legitime rien ne change: l'action passait deja l'id du
--     membre appelant.
--
-- CE QUI N'EST PAS TOUCHE: la logique de caisse (verrou `FOR UPDATE` sur la
-- commande, recalcul du net dans la transaction, rejeu par
-- `client_request_id`). Elle ferme un TOCTOU de double remboursement et est
-- recopiee a l'identique.
--
-- Rejouable: `create or replace` et `revoke`/`grant` sont idempotents.
--
-- Rollback: reappliquer la definition precedente, conservee dans
-- supabase/schema.sql a la revision precedant cette migration.
-- ============================================================================

create or replace function public.record_refund(
  p_order_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_method text,
  p_created_by uuid default null::uuid,
  p_client_request_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_total      numeric;
  v_tip        numeric;
  v_net        numeric;
  v_payment_id uuid;
  v_actor      uuid;
  v_role       text;
  v_custom     jsonb;
  v_tenant_ovr jsonb;
  v_allowed    boolean;
BEGIN
  -- (1) APPARTENANCE, avant toute autre chose. Leve 42501 si l'appelant n'est
  -- pas membre du restaurant. Laisse passer service_role et les super-admins.
  PERFORM public.assert_tenant_member(p_tenant_id);

  -- (2) HABILITATION. service_role (webhooks, cron) et super-admin agissent
  -- sans ligne de membre: pour eux `created_by` reste celui fourni, car ils
  -- agissent au nom de quelqu'un d'autre et n'ont pas d'id de membre propre.
  IF auth.role() = 'service_role' OR public.is_super_admin() THEN
    v_actor := p_created_by;
  ELSE
    -- La ligne de membre de l'APPELANT, jamais un parametre. `is_active` et
    -- `deleted_at` sont verifies ici: un compte suspendu ou retire ne doit pas
    -- pouvoir sortir de l'argent de la caisse.
    SELECT a.id, a.role, a.custom_permissions
      INTO v_actor, v_role, v_custom
    FROM admin_users a
    WHERE a.user_id = auth.uid()
      AND a.tenant_id = p_tenant_id
      AND a.is_active = true
      AND a.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'access denied: no active membership for tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;

    -- Le role doit figurer dans la MEME liste que celle de l'action serveur
    -- `actionRefundOrder`: ['owner','admin','manager']. Elle est plus stricte
    -- que la permission seule - par defaut `orders.manage` est aussi vrai pour
    -- `cashier` et `chef` (src/types/permission.types.ts) - et c'est la regle
    -- reellement appliquee en production aujourd'hui. On la reproduit telle
    -- quelle: une migration de securite n'est pas le lieu pour ELARGIR un
    -- acces.
    IF v_role NOT IN ('owner', 'admin', 'manager') THEN
      RAISE EXCEPTION 'access denied: role % cannot record refunds', v_role
        USING ERRCODE = '42501';
    END IF;

    -- Resolution de `orders.manage` dans l'ordre de src/lib/permissions.ts
    -- (hasPermission): owner toujours autorise, puis la derogation
    -- individuelle, puis la derogation du restaurant, puis le defaut du role.
    IF v_role = 'owner' THEN
      v_allowed := true;
    ELSIF v_custom ? 'orders.manage' THEN
      v_allowed := coalesce((v_custom -> 'orders.manage')::boolean, false);
    ELSE
      SELECT rp.permissions
        INTO v_tenant_ovr
      FROM role_permissions rp
      WHERE rp.tenant_id = p_tenant_id
        AND rp.role = v_role;

      IF v_tenant_ovr ? 'orders.manage' THEN
        v_allowed := coalesce((v_tenant_ovr -> 'orders.manage')::boolean, false);
      ELSE
        -- Defaut du role. Seul `waiter` a false, et il est de toute facon
        -- deja ecarte par la liste de roles ci-dessus.
        v_allowed := v_role IN ('owner', 'admin', 'manager', 'cashier', 'chef');
      END IF;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'access denied: orders.manage denied for role %', v_role
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ------------------------------------------------------------------------
  -- A partir d'ici, logique de caisse INCHANGEE (recopiee a l'identique).
  -- ------------------------------------------------------------------------
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
  VALUES (p_tenant_id, p_order_id, p_amount, p_method, 'refunded', v_actor, p_client_request_id)
  RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$function$;

comment on function public.record_refund(uuid, uuid, numeric, text, uuid, uuid) is
  'Enregistre un remboursement. Verifie l''appartenance au restaurant, le role et orders.manage, et derive created_by de auth.uid(): les parametres p_tenant_id et p_created_by ne sont plus crus sur parole. Voir 20261105120000_record_refund_tenant_guard.sql.';

-- Les droits d'execution restent INCHANGES: la fonction doit rester appelable
-- par `authenticated`, puisque l'action serveur utilise le client de
-- l'utilisateur. Ce qui change est que la fonction se defend elle-meme. On les
-- re-affirme malgre tout, car `create or replace` ne touche pas aux ACL mais
-- une recreation future pourrait les perdre.
grant execute on function public.record_refund(uuid, uuid, numeric, text, uuid, uuid) to authenticated;
grant execute on function public.record_refund(uuid, uuid, numeric, text, uuid, uuid) to service_role;

-- `anon` ne doit jamais rembourser: un convive non connecte n'a rien a faire
-- dans la caisse. Idempotent meme si le droit n'a jamais ete accorde.
revoke all on function public.record_refund(uuid, uuid, numeric, text, uuid, uuid) from anon;
