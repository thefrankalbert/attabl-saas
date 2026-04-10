-- ============================================================================
-- stock_alert_notifications: complete the CRUD coverage
-- ----------------------------------------------------------------------------
-- Audit found this table only had a SELECT policy, leaving INSERT/UPDATE/DELETE
-- without explicit policies (defaults to denied under RLS). Notifications were
-- being created via service_role bypass (createAdminClient) which works but
-- prevents tenant admins from ever marking them read or clearing them.
--
-- This adds full multi-tenant CRUD policies, scoped via the existing
-- get_my_tenant_ids_array() helper.
-- ============================================================================

-- INSERT: an admin can create a notification only for their own tenant
DROP POLICY IF EXISTS "stock_alert_notifications_insert" ON stock_alert_notifications;
CREATE POLICY "stock_alert_notifications_insert" ON stock_alert_notifications
  FOR INSERT
  WITH CHECK (tenant_id = ANY(get_my_tenant_ids_array()));

-- UPDATE: only admins of the same tenant can mark a notification read/dismissed
DROP POLICY IF EXISTS "stock_alert_notifications_update" ON stock_alert_notifications;
CREATE POLICY "stock_alert_notifications_update" ON stock_alert_notifications
  FOR UPDATE
  USING (tenant_id = ANY(get_my_tenant_ids_array()))
  WITH CHECK (tenant_id = ANY(get_my_tenant_ids_array()));

-- DELETE: only admins of the same tenant can delete a notification
DROP POLICY IF EXISTS "stock_alert_notifications_delete" ON stock_alert_notifications;
CREATE POLICY "stock_alert_notifications_delete" ON stock_alert_notifications
  FOR DELETE
  USING (tenant_id = ANY(get_my_tenant_ids_array()));
