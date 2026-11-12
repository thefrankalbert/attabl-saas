-- ATTABL ne propose plus que deux periodes d'abonnement: mensuelle et annuelle.
-- Decision produit du 2026-11-12. Le semestriel est retire du code, de Stripe
-- et de la base.
--
-- Verifie avant ecriture (2026-11-12): aucune ligne de `tenants` n'a
-- billing_interval = 'semiannual' (8 lignes, toutes 'monthly'). La contrainte
-- se resserre donc sans toucher aux donnees.
--
-- Retour arriere:
--   ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_billing_interval_check;
--   ALTER TABLE tenants ADD CONSTRAINT tenants_billing_interval_check
--     CHECK (billing_interval IN ('monthly', 'semiannual', 'yearly'));

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_billing_interval_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_billing_interval_check
  CHECK (billing_interval IN ('monthly', 'yearly'));
