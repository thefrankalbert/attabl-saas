-- ============================================================================
-- Fix QR code ordering: create item_price_variants table + RLS policies
-- Date: 2026-03-10
-- ============================================================================

-- The item_price_variants table was referenced in code but never created.
-- This caused "Erreur lors de la vérification du menu" when placing orders
-- via QR code because PostgREST returned a table-not-found error.

CREATE TABLE IF NOT EXISTS item_price_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_name_fr TEXT NOT NULL,
  variant_name_en TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  prices JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ipv_tenant ON item_price_variants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ipv_menu_item ON item_price_variants(menu_item_id);

-- RLS
ALTER TABLE item_price_variants ENABLE ROW LEVEL SECURITY;

-- Public can read price variants (needed for order validation via QR code)
DROP POLICY IF EXISTS "Public can view price variants" ON item_price_variants;
CREATE POLICY "Public can view price variants" ON item_price_variants
  FOR SELECT USING (TRUE);

-- Admins can manage price variants for their tenants
DROP POLICY IF EXISTS "Admins can manage price variants" ON item_price_variants;
CREATE POLICY "Admins can manage price variants" ON item_price_variants
  FOR ALL USING (tenant_id = ANY(get_my_tenant_ids_array()));
