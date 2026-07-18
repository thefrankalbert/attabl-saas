-- Idempotency keys for offline-replayed order mutations (status change,
-- server assignment, release). The durable outbox on a tablet replays the same
-- request (same client_request_id) once the network returns; without a dedup
-- key a cancel would restock twice or a "paid" flip would double-insert into the
-- payments ledger. This table records each processed mutation request so a
-- replay is a no-op.
--
-- Mirrors the order-creation idempotency approach (migration 20260628010000),
-- but for mutations, which route through /api/orders/mutations.
--
-- Rollback:
--   DROP TABLE IF EXISTS order_mutation_requests;

CREATE TABLE IF NOT EXISTS order_mutation_requests (
  client_request_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Set once the mutation has actually been applied. A row with a NULL
  -- processed_at is an in-flight (or crashed) claim: a concurrent duplicate
  -- must NOT be told "success" for it (the first attempt may still fail), it
  -- gets 409 and retries. Only processed_at IS NOT NULL dedupes as success.
  processed_at timestamptz
);

-- Index for tenant-scoped RLS lookups and cleanup.
CREATE INDEX IF NOT EXISTS idx_order_mutation_requests_tenant
  ON order_mutation_requests (tenant_id);

-- RLS filters ROWS, but the API roles still need base table privileges for the
-- policy to grant anything. Hosted Supabase auto-grants these via default
-- privileges; declaring them explicitly makes the table portable (works under a
-- raw psql apply too) and matches the "grants are load-bearing for RLS" rule.
GRANT SELECT, INSERT, UPDATE, DELETE ON order_mutation_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_mutation_requests TO service_role;

ALTER TABLE order_mutation_requests ENABLE ROW LEVEL SECURITY;

-- Only active members of the owning tenant can read/write their keys. Uses
-- auth.uid() (never client-supplied data) per the project's RLS rules.
DROP POLICY IF EXISTS order_mutation_requests_tenant_rw ON order_mutation_requests;
CREATE POLICY order_mutation_requests_tenant_rw ON order_mutation_requests
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND is_active
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM admin_users
      WHERE user_id = auth.uid() AND is_active
    )
  );
