-- Applied to production on 2026-11-08.
-- 1. App writes follow the web permission model (menu.edit honours per-employee / per-role overrides).
ALTER POLICY atfood_insert_menu_items ON public.menu_items
  WITH CHECK (public.has_tenant_write_permission(tenant_id, 'menu.edit'));
ALTER POLICY atfood_insert_categories ON public.categories
  WITH CHECK (public.has_tenant_write_permission(tenant_id, 'menu.edit'));
ALTER POLICY "Admins manage own tenant drafts" ON public.dish_photo_drafts
  USING (public.has_tenant_write_permission(tenant_id, 'menu.edit'))
  WITH CHECK (public.has_tenant_write_permission(tenant_id, 'menu.edit'));

-- 2. Dish photo writes limited to menu.edit (was: any staff role). Web uploads use the service role.
-- Guarded: the pgTAP database has a `storage` schema but no `storage.objects` table.
DO $guard$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects absent: storage policies skipped';
    RETURN;
  END IF;
  EXECUTE $sql$
ALTER POLICY "Tenants can upload menu photos" ON storage.objects
  WITH CHECK (bucket_id = 'menu-items' AND CASE
    WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_tenant_write_permission(((storage.foldername(name))[1])::uuid, 'menu.edit')
    ELSE false END)
  $sql$;
  EXECUTE $sql$
ALTER POLICY "Tenants can update own menu photos" ON storage.objects
  USING (bucket_id = 'menu-items' AND CASE
    WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_tenant_write_permission(((storage.foldername(name))[1])::uuid, 'menu.edit')
    ELSE false END)
  WITH CHECK (bucket_id = 'menu-items' AND CASE
    WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_tenant_write_permission(((storage.foldername(name))[1])::uuid, 'menu.edit')
    ELSE false END)
  $sql$;
  EXECUTE $sql$
ALTER POLICY "Tenants can delete own menu photos" ON storage.objects
  USING (bucket_id = 'menu-items' AND CASE
    WHEN (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_tenant_write_permission(((storage.foldername(name))[1])::uuid, 'menu.edit')
    ELSE false END)
  $sql$;
END $guard$;

-- 3. A dish / category can only reference a category / menu of the same tenant.
ALTER TABLE public.categories ADD CONSTRAINT categories_id_tenant_key UNIQUE (id, tenant_id);
ALTER TABLE public.menus ADD CONSTRAINT menus_id_tenant_key UNIQUE (id, tenant_id);
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_category_same_tenant
  FOREIGN KEY (category_id, tenant_id) REFERENCES public.categories (id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD CONSTRAINT categories_menu_same_tenant
  FOREIGN KEY (menu_id, tenant_id) REFERENCES public.menus (id, tenant_id) ON DELETE CASCADE;

-- 4. No client role needs TRUNCATE.
REVOKE TRUNCATE ON public.menu_items, public.categories, public.dish_photo_drafts FROM authenticated;
