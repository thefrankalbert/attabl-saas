-- ============================================================================
-- Add DELETE RLS policy for order_items
-- Date: 2026-03-11
-- ============================================================================
-- The order_items table had SELECT, INSERT, and UPDATE policies but no DELETE
-- policy. This prevented admins from deleting order items (and cascading
-- deletes from orders).

DROP POLICY IF EXISTS "Admins can delete own tenant order items" ON order_items;
CREATE POLICY "Admins can delete own tenant order items" ON order_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
      AND o.tenant_id = ANY(get_my_tenant_ids_array())
    )
  );
