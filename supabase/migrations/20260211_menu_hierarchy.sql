-- ============================================
-- ATTABL SaaS - Menu/Carte Hierarchy Migration
-- ============================================
-- Introduces the `menus` table for card/sub-card structure:
--   Tenant -> Venue (optional) -> Menu (carte) -> Category -> Item
--   Menus can have parent_menu_id for sous-cartes (tabs/onglets)

-- ─── PART 1: MENUS TABLE ─────────────────────────────────

CREATE TABLE IF NOT EXISTS menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  parent_menu_id UUID REFERENCES menus(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_en TEXT,
  slug TEXT NOT NULL,
  description TEXT,
  description_en TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

-- ─── INDEXES ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_menus_tenant ON menus(tenant_id);
CREATE INDEX IF NOT EXISTS idx_menus_venue ON menus(venue_id);
CREATE INDEX IF NOT EXISTS idx_menus_parent ON menus(parent_menu_id);
CREATE INDEX IF NOT EXISTS idx_menus_slug ON menus(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_menus_active ON menus(tenant_id, is_active)
  WHERE is_active = TRUE;

-- ─── PART 2: ADD menu_id TO CATEGORIES ───────────────────

ALTER TABLE categories ADD COLUMN IF NOT EXISTS menu_id UUID
  REFERENCES menus(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_categories_menu ON categories(menu_id);

-- ─── PART 3: RLS POLICIES ────────────────────────────────

ALTER TABLE menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active menus" ON menus;
CREATE POLICY "Public can view active menus" ON menus
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins can manage menus" ON menus;
CREATE POLICY "Admins can manage menus" ON menus
  FOR ALL USING (tenant_id IN (SELECT get_my_tenant_ids()));

-- ─── PART 4: SLUG GENERATION HELPER ─────────────────────

CREATE OR REPLACE FUNCTION generate_menu_slug(
  p_tenant_id UUID,
  p_name TEXT
) RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- Transliterate accented chars and create slug
  base_slug := LOWER(TRIM(BOTH '-' FROM
    REGEXP_REPLACE(
      TRANSLATE(
        LOWER(TRIM(p_name)),
        'àâäéèêëïîôùûüÿçñ ',
        'aaaeeeeiioouuycn-'
      ),
      '[^a-z0-9-]+', '-', 'g'
    )
  ));

  -- Remove consecutive dashes
  base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');

  -- Ensure non-empty
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'carte';
  END IF;

  final_slug := base_slug;

  -- Ensure uniqueness within tenant
  WHILE EXISTS (
    SELECT 1 FROM menus WHERE tenant_id = p_tenant_id AND slug = final_slug
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- ─── PART 5: MIGRATION — CREATE DEFAULT MENUS ───────────
-- For every existing tenant, create a "Carte Principale" and
-- assign all orphan categories to it.

DO $$
DECLARE
  t RECORD;
  new_menu_id UUID;
  default_slug TEXT;
BEGIN
  FOR t IN SELECT DISTINCT id, slug, name FROM tenants LOOP
    -- Generate unique slug
    default_slug := generate_menu_slug(t.id, 'Carte Principale');

    -- Create default menu
    INSERT INTO menus (tenant_id, name, name_en, slug, is_active, display_order)
    VALUES (t.id, 'Carte Principale', 'Main Menu', default_slug, TRUE, 0)
    ON CONFLICT (tenant_id, slug) DO NOTHING
    RETURNING id INTO new_menu_id;

    -- If menu already existed (conflict), get its ID
    IF new_menu_id IS NULL THEN
      SELECT id INTO new_menu_id FROM menus
        WHERE tenant_id = t.id AND slug = default_slug
        LIMIT 1;
    END IF;

    -- Assign all orphan categories to this default menu
    IF new_menu_id IS NOT NULL THEN
      UPDATE categories SET menu_id = new_menu_id
        WHERE tenant_id = t.id AND menu_id IS NULL;
    END IF;
  END LOOP;
END;
$$;

-- ─── PART 6: UPDATED_AT TRIGGER ─────────────────────────

CREATE OR REPLACE FUNCTION update_menus_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_menus_updated_at ON menus;
CREATE TRIGGER trigger_menus_updated_at
  BEFORE UPDATE ON menus
  FOR EACH ROW EXECUTE FUNCTION update_menus_updated_at();
