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

--
-- A appliquer en UNE transaction, sinon un ADD qui echoue laisse la table sans
-- aucune contrainte apres un DROP reussi:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f <ce fichier>
--
-- `tenants` est lue a chaque requete par le proxy: on n'attend pas plus de 5 s
-- un verrou tenu par une longue transaction, on echoue et on reessaie.

SET lock_timeout = '5s';

DO $$
DECLARE
  hors_regle integer;
BEGIN
  SELECT count(*) INTO hors_regle
  FROM tenants
  WHERE billing_interval IS NOT NULL AND billing_interval NOT IN ('monthly', 'yearly');
  IF hors_regle > 0 THEN
    RAISE EXCEPTION '% restaurant(s) ont une periode hors mensuel/annuel: les passer en monthly ou yearly avant cette migration', hors_regle;
  END IF;
END $$;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_billing_interval_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_billing_interval_check
  CHECK (billing_interval IN ('monthly', 'yearly'));
