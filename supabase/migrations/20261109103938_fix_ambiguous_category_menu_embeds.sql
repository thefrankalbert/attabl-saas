-- The composite same-tenant FKs added in atfood_security_hardening created a SECOND relationship
-- menu_items->categories and categories->menus, so PostgREST embeds like categories(...) failed (PGRST201).
-- Keep the guarantee with triggers, which PostgREST does not see as relationships.
ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_category_same_tenant;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_menu_same_tenant;

CREATE OR REPLACE FUNCTION public.enforce_menu_item_category_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories c WHERE c.id = NEW.category_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'category belongs to another restaurant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_category_menu_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.menu_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.menus m WHERE m.id = NEW.menu_id AND m.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'menu belongs to another restaurant' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS menu_items_category_same_tenant ON public.menu_items;
CREATE TRIGGER menu_items_category_same_tenant
  BEFORE INSERT OR UPDATE OF category_id, tenant_id ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_menu_item_category_tenant();

DROP TRIGGER IF EXISTS categories_menu_same_tenant ON public.categories;
CREATE TRIGGER categories_menu_same_tenant
  BEFORE INSERT OR UPDATE OF menu_id, tenant_id ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_category_menu_tenant();

REVOKE ALL ON FUNCTION public.enforce_menu_item_category_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_category_menu_tenant() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
