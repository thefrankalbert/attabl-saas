-- Extend tenants.currency check constraint to allow XOF (BCEAO franc CFA,
-- used by West African countries: Burkina Faso, Cote d'Ivoire, Senegal, etc.).
-- Both XAF (BEAC) and XOF (BCEAO) are colloquially called "FCFA" and have the
-- same fixed peg to the euro (1 EUR = 655.957).

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_currency_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_currency_check
  CHECK (currency IN ('XAF', 'XOF', 'EUR', 'USD'));
