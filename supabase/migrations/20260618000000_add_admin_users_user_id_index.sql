-- Add a standalone index on admin_users(user_id).
--
-- Why: the RLS helper get_my_tenant_ids_array() (see 20260227000002_rls_optimization.sql)
-- filters admin_users by `user_id = auth.uid()`. The only existing index,
-- idx_admin_users_tenant (tenant_id, user_id) from 20260227000001_performance_indexes.sql,
-- leads with tenant_id, so a query that constrains only user_id cannot use it and falls
-- back to a sequential scan. Because that helper runs on every RLS-protected query, the
-- missing index degrades read latency platform-wide as admin_users grows.
--
-- Safe: CREATE INDEX IF NOT EXISTS is idempotent and non-destructive. Review-only until
-- applied with `pnpm db:migrate` (supabase db push).

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users (user_id);
