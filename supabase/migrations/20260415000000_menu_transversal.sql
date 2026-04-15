-- ============================================
-- ATTABL SaaS - Transversal Menu Flag
-- ============================================
-- Adds is_transversal_menu to menus. A transversal menu (e.g. "Boissons")
-- is available as a sub-tab on every other top-level menu, instead of
-- only when the user explicitly picks it.

ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS is_transversal_menu BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN menus.is_transversal_menu IS
  'When TRUE, this menu (carte) is exposed as a sub-tab on every other top-level menu in the client UI.';

CREATE INDEX IF NOT EXISTS idx_menus_transversal
  ON menus(tenant_id)
  WHERE is_transversal_menu = TRUE;
