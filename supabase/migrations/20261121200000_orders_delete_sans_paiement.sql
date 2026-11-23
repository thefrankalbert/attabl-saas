-- ============================================================================
-- ORDRE DE DEPLOIEMENT OBLIGATOIRE : appliquer cette migration APRES le
-- deploiement du code de ce lot (fix/revue-lignes-lot-a), jamais avant.
-- L'ancien code en ligne supprime d'abord les articles (`order_items`), puis la
-- commande, sans compter les lignes. Avec cette politique, la base refuserait
-- la commande a acompte sans erreur: elle garderait son paiement mais perdrait
-- tous ses articles, et l'ecran afficherait "supprimee" (prouve par le second
-- contre-audit du lot A). Le nouveau code refuse avant toute ecriture et ne
-- supprime plus les articles a part.
-- Les autres migrations du lot (20261121200100, 200200, 200300 et 200400)
-- peuvent passer avant ou apres le code.
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
-- seule la clause NOT EXISTS est ajoutee. Elle REMPLACE la politique de meme
-- nom, "Money managers can delete own tenant orders" (PERMISSIVE, condition
-- has_tenant_money_permission(tenant_id)), seule politique DELETE de `orders`
-- en production d'apres l'orchestrateur. Aucune autre politique permissive
-- DELETE ou ALL ne reste a cote (sinon elle s'ajouterait par OU et annulerait
-- la garde): verifie par revue_lot_a.test.sql (assertion 18).
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
