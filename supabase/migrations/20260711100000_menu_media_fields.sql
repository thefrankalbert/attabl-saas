-- Menu media fields (storefront presentation).
--
-- The storefront had no place to store: a restaurant banner image, a category
-- cover image, or more than one photo per menu item. This adds three additive,
-- nullable-or-defaulted columns so the demo dossier's media (banner, 10 category
-- covers, per-item galleries) can be injected and rendered, and so admins can
-- edit them from settings / category / item forms.
--
-- APPLY TO PROD BACKUP-FIRST. Purely additive: new columns only, no backfill,
-- no data migration, no RLS change (existing table policies already cover new
-- columns; column privileges inherit from the table grants).

-- 1. Restaurant banner (tenants) - stored URL, same path as logo_url.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS banner_url text;

-- 2. Category cover image (categories) - stored URL.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_url text;

-- 3. Menu item gallery (menu_items) - ordered list of image URLs. The primary
--    photo stays in image_url; this holds the full gallery (primary + variants)
--    for the item detail view. Defaults to an empty array so reads never NULL.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
