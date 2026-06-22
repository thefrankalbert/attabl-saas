-- QA real-time hardening: close cross-tenant RLS read exposures.
--
-- Context: several SELECT policies used USING(true) and applied TO public
-- (anon + authenticated). The anon role was column-restricted for orders/
-- order_items by 20260506155500, but the authenticated role kept full access,
-- so any logged-in user could read other tenants' order PII and catalog rows
-- via the data API (the app layer always filters by tenant_id; this restores
-- the RLS safety-net that the app relies on as defense-in-depth).
--
-- Strategy:
--   * orders / order_items: keep the public read for ANON only (UUID-based
--     customer order tracking, non-PII columns already enforced by grants in
--     20260506155500); the AUTHENTICATED role falls back to the existing
--     tenant-scoped admin SELECT policies, so cross-tenant authenticated reads
--     are blocked.
--   * item catalog children (modifiers / options / price_variants): the public
--     read is gated to anon AND to rows whose parent menu_item is available,
--     i.e. parity with the existing "Public can view available menu items"
--     policy - the public menu only ever exposes available items. Admins keep
--     full own-tenant access (existing FOR ALL on item_modifiers; new tenant-
--     scoped FOR ALL added for item_options / item_price_variants).
--   * zones / tables: LEFT PUBLIC (is_active = true). These are storefront data:
--     the anonymous convive landing page reads `tables` via the anon key for the
--     QR/table picker (src/app/sites/[site]/(storefront)/page.tsx), exactly like
--     the public menu_items/categories/venues policies. Restricting them to
--     authenticated would empty the table picker for every unauthenticated diner,
--     so the original public read is intentional and kept as-is. (Cross-tenant
--     active-table/zone visibility is the same low-sensitivity public-storefront
--     exposure as the menu itself, not order PII.)
--
-- Rollback: re-create the dropped policies as FOR SELECT USING (true) / (is_active = true).

-- ============================================================================
-- orders / order_items - anon-only public read (BUG-013)
-- ============================================================================
DROP POLICY IF EXISTS "Orders are publicly readable" ON "public"."orders";
CREATE POLICY "Orders are anon-readable for tracking" ON "public"."orders"
  FOR SELECT TO "anon" USING (true);

DROP POLICY IF EXISTS "Order items are publicly readable" ON "public"."order_items";
CREATE POLICY "Order items are anon-readable for tracking" ON "public"."order_items"
  FOR SELECT TO "anon" USING (true);

-- ============================================================================
-- item catalog children - anon read gated on parent availability (BUG-014)
-- ============================================================================
DROP POLICY IF EXISTS "Item modifiers viewable by public" ON "public"."item_modifiers";
CREATE POLICY "Item modifiers viewable by anon for available items" ON "public"."item_modifiers"
  FOR SELECT TO "anon" USING (
    EXISTS (
      SELECT 1 FROM "public"."menu_items" "mi"
      WHERE "mi"."id" = "item_modifiers"."menu_item_id"
        AND "mi"."is_available" = true
        AND "mi"."deleted_at" IS NULL
    )
  );

DROP POLICY IF EXISTS "Public can view item options" ON "public"."item_options";
CREATE POLICY "Item options viewable by anon for available items" ON "public"."item_options"
  FOR SELECT TO "anon" USING (
    EXISTS (
      SELECT 1 FROM "public"."menu_items" "mi"
      WHERE "mi"."id" = "item_options"."menu_item_id"
        AND "mi"."is_available" = true
        AND "mi"."deleted_at" IS NULL
    )
  );
CREATE POLICY "Admins manage own tenant item options" ON "public"."item_options"
  FOR ALL TO "authenticated"
  USING ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))
  WITH CHECK ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()));

DROP POLICY IF EXISTS "Public can view price variants" ON "public"."item_price_variants";
CREATE POLICY "Price variants viewable by anon for available items" ON "public"."item_price_variants"
  FOR SELECT TO "anon" USING (
    EXISTS (
      SELECT 1 FROM "public"."menu_items" "mi"
      WHERE "mi"."id" = "item_price_variants"."menu_item_id"
        AND "mi"."is_available" = true
        AND "mi"."deleted_at" IS NULL
    )
  );
CREATE POLICY "Admins manage own tenant price variants" ON "public"."item_price_variants"
  FOR ALL TO "authenticated"
  USING ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()))
  WITH CHECK ("tenant_id" = ANY ("public"."get_my_tenant_ids_array"()));

-- zones / tables: intentionally NOT modified. They are public storefront data
-- (anon QR/table picker reads `tables` via the anon key), consistent with the
-- public menu_items/categories/venues policies. See the header note.
