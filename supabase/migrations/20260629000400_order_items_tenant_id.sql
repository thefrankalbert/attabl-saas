-- order_items.tenant_id (audit finding H10).
--
-- order_items had no tenant_id: isolation was purely transitive via order_id ->
-- orders.tenant_id, forcing a subquery on every RLS check and leaving item
-- access single-layered (it violates the project rule "every tenant table has a
-- tenant_id"). This adds the column, backfills it, and keeps it populated with a
-- BEFORE INSERT trigger so EVERY insert path (incl. the guarded
-- create_order_with_items RPC and any future caller) sets it automatically -
-- deliberately WITHOUT touching that RPC, which has drifted in prod and is risky
-- to recreate blind.
--
-- APPLY TO PROD BACKUP-FIRST. Additive: new nullable column -> backfill ->
-- trigger -> NOT NULL. order_items.order_id is FK ON DELETE CASCADE so no orphan
-- rows exist, making the backfill total and the SET NOT NULL safe.

-- 1. Column + FK (CASCADE matches order_items.order_id -> orders behaviour).
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 2. Backfill from the parent order.
UPDATE public.order_items oi
SET tenant_id = o.tenant_id
FROM public.orders o
WHERE o.id = oi.order_id
  AND oi.tenant_id IS NULL;

-- 3. Auto-populate on insert (covers the RPC and every other path).
CREATE OR REPLACE FUNCTION public.set_order_item_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT o.tenant_id INTO NEW.tenant_id
    FROM public.orders o
    WHERE o.id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_tenant_id ON public.order_items;
CREATE TRIGGER trg_order_items_tenant_id
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_item_tenant_id();

-- 4. Index for tenant-scoped reads / RLS.
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_id ON public.order_items (tenant_id);

-- 5. Enforce presence now that backfill + trigger guarantee it.
ALTER TABLE public.order_items ALTER COLUMN tenant_id SET NOT NULL;

-- 6. Defense-in-depth RLS: a direct tenant-scoped policy alongside the existing
-- order_id-subquery policies (additive; does not drop anything).
DROP POLICY IF EXISTS "order_items_tenant_select" ON public.order_items;
CREATE POLICY "order_items_tenant_select" ON public.order_items
  FOR SELECT TO authenticated
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
