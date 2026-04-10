-- Add font_family column to tenants for curated font customization.
-- Per 2025/2026 market research (Toast, Square, Lightspeed pattern), tenants
-- can select from a curated list of 10 Google Fonts defined in
-- src/lib/config/fonts.ts. The column stores the font id (e.g. 'inter',
-- 'poppins', 'playfair-display'). NULL falls back to Inter.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS font_family VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN tenants.font_family IS
  'Tenant-selected font id from the curated list in src/lib/config/fonts.ts. NULL = default Inter.';

-- Rollback:
-- ALTER TABLE tenants DROP COLUMN IF EXISTS font_family;
