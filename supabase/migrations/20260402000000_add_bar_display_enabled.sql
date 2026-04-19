-- Add bar_display_enabled to tenants table
-- When false (default): all items (including drinks) appear on KDS together
-- When true: the KDS shows a zone filter (Kitchen / Bar / All)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS bar_display_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.bar_display_enabled IS
  'When false, all items (including drinks) appear on KDS; when true, the KDS shows a zone filter (Kitchen/Bar/All)';
