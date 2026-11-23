-- ============================================================================
-- Une commande qui porte de l'argent au registre ne se supprime pas (revue L011, A1).
-- ============================================================================
--
-- LE DEFAUT. `payments.order_id` est ON DELETE CASCADE. La politique DELETE de
-- `orders` ne regardait que le droit d'argent: un proprietaire ou un admin avec
-- `orders.pay` pouvait supprimer une commande `partial` (acompte encaisse) ou
-- `refunded`, et la cascade (non soumise a la RLS) effacait l'encaissement du
-- registre. Le chiffre du jour, lu au registre, perdait cet argent.
--
-- LE CORRECTIF. La politique DELETE exige en plus qu'aucune ligne `payments`
-- ne soit rattachee a la commande. L'action serveur refuse deja avant (message
-- clair); ceci est la seconde garde, pour un appel direct a l'API.
--
-- POURQUOI PAS `ON DELETE RESTRICT` sur la cle. `reset_tenant_data` (remise a
-- zero voulue par le proprietaire, SECURITY DEFINER) et la suppression d'un
-- restaurant (cascade depuis `tenants`) suppriment des commandes payees: une
-- cle restrictive les casserait. Une politique RLS ne s'applique qu'aux
-- employes connectes (authenticated), pas a ces chemins systeme.
--
-- Corps repris de 20261107200000_garde_argent_statut_et_parite.sql (section 3),
-- seule la clause NOT EXISTS est ajoutee.
--
-- Rollback:
--   DROP POLICY IF EXISTS "Money managers can delete own tenant orders" ON public.orders;
--   CREATE POLICY "Money managers can delete own tenant orders"
--     ON public.orders FOR DELETE
--     USING (public.has_tenant_money_permission(orders.tenant_id));
-- ============================================================================

DROP POLICY IF EXISTS "Money managers can delete own tenant orders" ON public.orders;

CREATE POLICY "Money managers can delete own tenant orders"
  ON public.orders
  FOR DELETE
  USING (
    public.has_tenant_money_permission(orders.tenant_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.order_id = orders.id
    )
  );
