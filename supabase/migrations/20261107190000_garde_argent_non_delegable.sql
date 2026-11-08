-- ============================================================================
-- L'ARGENT ne doit pas se deleguer avec les commandes
-- ============================================================================
--
-- POURQUOI CE FICHIER EXISTE. 20261107170000 a rendu la garde d'ecriture
-- sensible aux delegations du proprietaire, ce qui etait le but: un chef a qui
-- on accorde `inventory.edit` doit pouvoir gerer les stocks. Mais cela a
-- ouvert un ecart que l'application, elle, n'a jamais permis.
--
-- L'APPLICATION separe l'argent du reste par le ROLE, pas par la permission.
-- Dans `src/lib/admin-roles.ts`:
--
--   ORDER_STAFF_ROLES  les six roles      -> prendre et faire avancer une
--                                           commande, encaisser un tender,
--                                           lister un compte maison
--   ORDER_MONEY_ROLES  owner/admin/manager -> REMBOURSER, OFFRIR (comp),
--                                           OUVRIR ou SOLDER un compte maison
--
-- Un caissier ne peut donc JAMAIS annuler une note a zero, meme s'il detient
-- `orders.manage`. C'est volontaire: c'est une surface de fraude.
--
-- LA BASE, elle, n'avait qu'UNE permission pour les deux: `orders.manage`.
-- Tant que la garde refusait tout role hors owner/admin/manager, la protection
-- de l'argent existait par accident. Depuis 20261107170000, une delegation la
-- leve. Un caissier a qui le proprietaire accorde `orders.manage` pouvait donc,
-- via PostgREST et son propre JWT:
--
--   - inserer une ligne NEGATIVE dans `payments` - il n'y a aucune contrainte
--     `amount > 0` - donc un remboursement que le ledger accepte, en
--     contournant la RPC `record_refund`;
--   - poser `orders.payment_status = 'comp'` directement;
--   - ouvrir ou solder un compte maison.
--
-- Rien de tout cela n'etait exploitable avant ce lot: la delegation ne
-- fonctionnait pas, donc aucun tenant n'avait de delegation posee. L'ecart
-- serait apparu a l'application de ces migrations. Il est ferme ici, dans le
-- meme lot que la cause.
--
-- CE QUI N'EST PAS RESSERRE, ET POURQUOI. Encaisser un TENDER reste au niveau
-- du personnel: c'est le service normal, et l'application l'autorise
-- (`actionRecordTender` utilise ORDER_STAFF_ROLES). La policy d'insertion de
-- `payments` ne borne donc pas QUI insere, elle borne LE SIGNE: un montant
-- positif est un encaissement, un montant negatif est un remboursement. Seuls
-- les roles argent peuvent inserer un negatif.
--
-- La RPC `record_refund` est SECURITY DEFINER (verifie: `prosecdef = true`),
-- donc elle contourne la RLS et le chemin legitime de remboursement n'est pas
-- touche par ce resserrage.
--
-- ROLLBACK: voir le bloc en fin de fichier.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. La garde ARGENT: basee sur le role, NON DELEGABLE
-- ---------------------------------------------------------------------------
-- Elle ne lit AUCUNE surcharge pour accorder: une delegation de `orders.manage`
-- ne peut jamais produire une autorite sur l'argent. Elle compose en revanche
-- la garde existante, qui ne fait que REFUSER davantage pour admin/manager -
-- donc un gerant a qui le proprietaire a retire `orders.manage` perd aussi
-- l'argent, ce qui est la regle de l'application.
--
-- SECURITY DEFINER pour la meme raison que la garde d'ecriture: elle lit
-- `admin_users`, dont le RLS masquerait les lignes a l'appelant. `search_path`
-- fige. EXECUTE a `anon` ET `authenticated`: une policy est evaluee pour le
-- role qui tente l'ecriture, et un refus d'EXECUTE casserait la RLS au lieu de
-- la durcir.
CREATE OR REPLACE FUNCTION public.has_tenant_money_permission(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND au.role = ANY (ARRAY['owner', 'admin', 'manager'])
  )
  AND public.has_tenant_write_permission(p_tenant, 'orders.manage');
$$;

GRANT EXECUTE ON FUNCTION public.has_tenant_money_permission(uuid)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. house_accounts: ouvrir, modifier, solder = de l'argent
-- ---------------------------------------------------------------------------
-- Ces trois policies viennent du lot 3 (20261107160000) et portaient
-- `orders.manage`. Elles passent a la garde argent: l'application reserve deja
-- la creation et le solde a ORDER_MONEY_ROLES.
DROP POLICY IF EXISTS "Order managers can insert own tenant house_accounts" ON public.house_accounts;
DROP POLICY IF EXISTS "Order managers can update own tenant house_accounts" ON public.house_accounts;
DROP POLICY IF EXISTS "Order managers can delete own tenant house_accounts" ON public.house_accounts;

CREATE POLICY "Money managers can insert own tenant house_accounts"
  ON public.house_accounts
  FOR INSERT
  WITH CHECK (public.has_tenant_money_permission(house_accounts.tenant_id));

CREATE POLICY "Money managers can update own tenant house_accounts"
  ON public.house_accounts
  FOR UPDATE
  USING (public.has_tenant_money_permission(house_accounts.tenant_id))
  WITH CHECK (public.has_tenant_money_permission(house_accounts.tenant_id));

CREATE POLICY "Money managers can delete own tenant house_accounts"
  ON public.house_accounts
  FOR DELETE
  USING (public.has_tenant_money_permission(house_accounts.tenant_id));

-- ---------------------------------------------------------------------------
-- 2. payments: le SIGNE decide, pas seulement le role
-- ---------------------------------------------------------------------------
-- `amount` est un bigint NOT NULL sans contrainte de signe. Un montant positif
-- est un encaissement (service normal, tout le personnel), un montant negatif
-- est un remboursement (autorite argent). La policy d'origine
-- (`payments_tenant_insert`, 20261107120000) ne regardait que la permission.
DROP POLICY IF EXISTS "payments_tenant_insert" ON public.payments;

CREATE POLICY "payments_tenant_insert"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    public.has_tenant_write_permission(payments.tenant_id, 'orders.manage')
    AND (
      payments.amount >= 0
      OR public.has_tenant_money_permission(payments.tenant_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. orders: une commande OFFERTE ou REMBOURSEE exige l'autorite argent
-- ---------------------------------------------------------------------------
-- La policy d'origine (20261107120000) n'exigeait que `orders.manage`, donc un
-- caissier delegue pouvait poser `payment_status = 'comp'` lui-meme. On ne peut
-- pas lire les colonnes MODIFIEES dans une policy, mais on peut contraindre la
-- LIGNE RESULTANTE via WITH CHECK: produire une ligne offerte ou remboursee
-- demande l'autorite argent.
--
-- Effet de bord assume: un employe sans autorite argent ne peut plus modifier
-- une commande DEJA offerte ou remboursee, puisque la ligne resultante porte
-- encore cet etat. C'est correct - ces etats sont terminaux.
--
-- `payment_status` est nullable, d'ou le `coalesce`. `is_comp` est NOT NULL
-- avec defaut false, mais le `coalesce` le rend robuste a une evolution.
-- USING n'est pas touche: il decide quelles LIGNES on peut viser, et la regle
-- y reste `orders.manage`.
DROP POLICY IF EXISTS "Order managers can update own tenant orders" ON public.orders;

CREATE POLICY "Order managers can update own tenant orders"
  ON public.orders
  FOR UPDATE
  USING (public.has_tenant_write_permission(orders.tenant_id, 'orders.manage'))
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

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Reposer les trois policies de house_accounts avec
-- `has_tenant_write_permission(tenant_id, 'orders.manage')` au lieu de
-- `has_tenant_money_permission(tenant_id)`; reposer `payments_tenant_insert` et
-- `Order managers can update own tenant orders` sans la seconde moitie de leur
-- WITH CHECK (voir 20261107120000 et 20261107160000 pour les definitions
-- exactes); puis `DROP FUNCTION public.has_tenant_money_permission(uuid)`.
--
-- Ce rollback REOUVRE le remboursement et l'offert a tout role portant une
-- delegation de `orders.manage`.
-- ============================================================================
