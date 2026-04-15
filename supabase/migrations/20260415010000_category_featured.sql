-- ============================================
-- ATTABL SaaS - Featured Category on Home
-- ============================================
-- Adds is_featured_on_home to categories. When TRUE, the category is
-- exposed in the client home "Categories" shortcut grid. Backward compat:
-- if no category is flagged, the home falls back to the first 8 by
-- display_order (legacy behaviour).

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_featured_on_home BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN categories.is_featured_on_home IS
  'When TRUE, this category is displayed in the client home shortcut grid. Restaurateurs pick explicitly which categories to highlight.';

CREATE INDEX IF NOT EXISTS idx_categories_featured_on_home
  ON categories(tenant_id)
  WHERE is_featured_on_home = TRUE;
