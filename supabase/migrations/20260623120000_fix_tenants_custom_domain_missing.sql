-- SEV-1 corrective migration.
--
-- 20260227000000_custom_domains.sql was recorded as applied in production but the
-- `tenants.custom_domain` column never materialized (added-then-dropped or repaired
-- into the tracker without executing). Because src/lib/cache.ts TENANT_SELECT selects
-- `custom_domain`, every tenant-admin render hit Postgres error 42703
-- ("column tenants.custom_domain does not exist"), getTenant()/getCachedTenant()
-- returned null, and src/app/sites/[site]/admin/layout.tsx hit `if (!tenant)
-- redirectToLogin()` -> every restaurateur was bounced to /login after launch.
--
-- Re-add the column idempotently. Additive, nullable, no data loss, reversible
-- (DROP COLUMN custom_domain). Already applied to production 2026-06-23 (backup-first).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain
  ON tenants(custom_domain)
  WHERE custom_domain IS NOT NULL;
