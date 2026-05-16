-- P3: Soft delete for menu_items (preserve order history and analytics).

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_menu_items_active
  ON menu_items (tenant_id, category_id)
  WHERE deleted_at IS NULL;

-- Public menu: hide soft-deleted items
DROP POLICY IF EXISTS "Public can view available menu items" ON menu_items;
CREATE POLICY "Public can view available menu items" ON menu_items
  FOR SELECT
  USING (is_available = true AND deleted_at IS NULL);
