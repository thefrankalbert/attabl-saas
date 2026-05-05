-- Tighten RLS on item_modifiers and item_price_variants.
-- Previously USING(TRUE) exposed all records (including unavailable ones) cross-tenant via anon REST API.
-- item_modifiers: restrict to is_available = true rows only.
-- item_price_variants: restrict to variants whose parent menu_item is available.

DROP POLICY IF EXISTS "Item modifiers viewable by public" ON item_modifiers;
CREATE POLICY "Item modifiers viewable by public" ON item_modifiers
  FOR SELECT USING (is_available = true);

DROP POLICY IF EXISTS "Public can view price variants" ON item_price_variants;
CREATE POLICY "Public can view price variants" ON item_price_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM menu_items mi
      WHERE mi.id = menu_item_id
        AND mi.is_available = true
    )
  );
