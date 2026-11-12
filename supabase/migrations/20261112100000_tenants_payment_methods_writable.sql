-- Les modes de paiement d'un restaurant ne pouvaient JAMAIS etre enregistres.
--
-- POURQUOI. `enabled_payment_methods` a ete ajoutee par 20260430130000, APRES
-- 20260420000002_restrict_tenant_billing_updates qui a remplace le droit UPDATE
-- de `authenticated` sur `tenants` par une liste de colonnes. La nouvelle
-- colonne n'a jamais ete ajoutee a cette liste: Reglages > Modes de paiement
-- echouait a chaque fois avec "Erreur lors de la mise a jour" (42501 cote base).
-- Constat C-069 de l'audit du 2026-11-10, reproduit trois fois.
--
-- CE QUE CA OUVRE. Le restaurateur choisit les moyens de paiement qu'il accepte.
-- Ce n'est ni de la facturation ni un droit du plan. La RLS existante
-- ("Admins can update own tenant") limite deja l'ecriture a ses restaurants, et
-- l'action serveur exige `settings.edit`.
--
-- GARDE EN BASE. Une ecriture directe par l'API contournerait la validation de
-- l'action: la contrainte n'accepte qu'une liste non vide de moyens connus.
-- NOT VALID: elle s'applique aux nouvelles ecritures sans relire les lignes
-- existantes (le defaut historique {cash,card} y est conforme de toute facon).
--
-- ADDITIVE: aucun acces retire, aucune donnee modifiee.
--
-- Rollback:
--   REVOKE UPDATE (enabled_payment_methods) ON public.tenants FROM authenticated;
--   ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_enabled_payment_methods_known;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_enabled_payment_methods_known;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_enabled_payment_methods_known
  CHECK (
    cardinality(enabled_payment_methods) >= 1
    AND enabled_payment_methods <@ ARRAY[
      'cash', 'card', 'wave', 'orange_money', 'mtn_momo', 'free_money'
    ]::text[]
  ) NOT VALID;

GRANT UPDATE (enabled_payment_methods) ON public.tenants TO authenticated;
