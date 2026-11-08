-- ============================================================================
-- La garde argent regardait le SIGNE; le ledger regarde le STATUT
-- ============================================================================
--
-- Complete 20261107190000, dont la garde etait incomplete sur trois points.
-- Signales par la revue de securite, mesures, et corriges ici dans le meme lot.
--
-- 1. DECALAGE DE VALIDATEUR SUR `payments` (le plus grave)
--
-- 20261107190000 bornait l'insertion par le SIGNE du montant: positif =
-- encaissement, negatif = remboursement. Mais le ledger de l'application ne
-- regarde pas le signe, il regarde le STATUT (`src/services/payment.calc.ts`):
--
--   const refunded = tenders
--     .filter((t) => t.status === 'refunded')
--     .reduce((sum, t) => sum + t.amount, 0);
--   const net = completed - refunded;
--
-- Une ligne `status = 'refunded'` SOUSTRAIT donc son montant, quel que soit son
-- signe. Un caissier porteur d'une delegation `orders.manage` pouvait inserer
-- `{ amount: +5000, status: 'refunded' }`: positif, donc accepte par la garde
-- precedente, et pourtant un remboursement de 5000 pour le ledger. Deux
-- notions differentes de "remboursement", une par couche - exactement le genre
-- d'ecart qu'une garde en base doit eviter.
--
-- La garde porte desormais sur le STATUT, qui est la notion que le ledger
-- utilise reellement, et garde la borne de signe en complement: une ligne
-- `completed` a montant negatif reduirait le net tout autant.
--
-- 2. PARITE MANQUANTE SUR L'INSERTION DE `orders`
--
-- 20261107190000 a pose la condition comp/rembourse sur l'UPDATE de `orders`,
-- et pas sur l'INSERT. Or `create_order_with_items` n'est PAS SECURITY DEFINER
-- (verifie: `prosecdef = false`), donc l'insertion passe par la RLS avec le
-- jeton de l'utilisateur: une commande pouvait naitre DEJA offerte. Meme
-- condition posee sur l'INSERT.
--
-- 3. SUPPRESSION DE `orders`
--
-- La policy DELETE exigeait `orders.manage`, qu'une delegation accorde. Le
-- chemin applicatif, lui, est plus strict que les roles argent: il exige
-- `['owner', 'admin']` (actions/orders.ts, "privilege escalation prevention").
-- Supprimer une commande detruit une note, donc une recette: la policy passe a
-- la garde argent. Elle reste plus permissive que l'application (qui exclut le
-- gerant), ce qui est conforme au modele du projet - la RLS est un filet de
-- securite, pas la regle principale - et elle n'est plus franchissable par une
-- simple delegation.
--
-- CE QUI A ETE EXAMINE ET ECARTE, AVEC MOTIF. La revue suggerait aussi
-- d'exiger l'autorite argent quand la ligne resultante porte un
-- `house_account_id` avec `payment_status = 'paid'`, en supposant qu'il s'agit
-- du solde d'une ardoise. Mesure: le solde d'une ardoise
-- (`order-annotation.service.ts`, `settleHouseAccount`) n'ecrit QUE
-- `house_accounts`, jamais `orders`. Et attacher une commande a une ardoise est
-- une action de PERSONNEL dans l'application (`actionAttachOrderToHouseAccount`
-- utilise ORDER_STAFF_ROLES). Poser cette exigence casserait donc une
-- fonctionnalite de service sans fermer de chemin d'argent. Ecartee.
--
-- ROLLBACK: reposer les trois policies telles que 20261107190000 et
-- 20261107120000 les definissent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. payments: le STATUT decide
-- ---------------------------------------------------------------------------
-- `status` est contraint a ('completed', 'refunded') par
-- `payments_status_check`, donc ces deux branches couvrent tout.
DROP POLICY IF EXISTS "payments_tenant_insert" ON public.payments;

CREATE POLICY "payments_tenant_insert"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    public.has_tenant_write_permission(payments.tenant_id, 'orders.manage')
    AND (
      -- Encaissement: service normal, tout le personnel. Le signe reste borne,
      -- un `completed` negatif reduirait le net comme un remboursement.
      (payments.status = 'completed' AND payments.amount >= 0)
      -- Toute autre forme - un remboursement, ou un encaissement negatif -
      -- exige l'autorite argent.
      OR public.has_tenant_money_permission(payments.tenant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. orders INSERT: une commande ne peut pas NAITRE offerte
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Order managers can insert own tenant orders" ON public.orders;

CREATE POLICY "Order managers can insert own tenant orders"
  ON public.orders
  FOR INSERT
  WITH CHECK (
    public.has_tenant_write_permission(orders.tenant_id, 'orders.manage')
    AND (
      (
        coalesce(orders.payment_status, '') NOT IN ('comp', 'refunded')
        AND coalesce(orders.is_comp, false) = false
      )
      OR public.has_tenant_money_permission(orders.tenant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. orders DELETE: detruire une note est une autorite argent
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Order managers can delete own tenant orders" ON public.orders;

CREATE POLICY "Money managers can delete own tenant orders"
  ON public.orders
  FOR DELETE
  USING (public.has_tenant_money_permission(orders.tenant_id));
