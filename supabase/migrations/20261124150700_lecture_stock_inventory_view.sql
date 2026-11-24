-- ============================================================================
-- Revue ligne par ligne, lot B2b-1: B127 (Basse). Les fonctions de LECTURE du
-- stock exigent le droit `inventory.view`, comme les ecrans.
--
-- CE QUI NE TENAIT PAS. `get_losses_by_reason`, `get_stock_movements_page`,
-- `get_stock_status` et `verify_stock_ledger` (SECURITY DEFINER, executables
-- par `authenticated`) ne controlaient que l'appartenance au restaurant
-- (`assert_tenant_member`). Les ecrans qui les appellent exigent
-- `inventory.view` (`requireAdminPermission(site, 'inventory.view')`,
-- `checkInventoryViewPermissions`), faux par defaut pour le caissier et le
-- serveur: par appel direct, un serveur lisait le rapport des pertes valorise
-- et tout l'historique des mouvements. Pas de fuite entre restaurants.
--
-- LA CORRECTION.
-- 1. `has_tenant_write_permission` connait `inventory.view` avec la valeur par
--    defaut de l'application (`src/types/permission.types.ts`): proprietaire,
--    admin, gerant ET chef. Sans cette branche, la valeur par defaut generique
--    (admin, gerant) aurait retire la lecture au chef. Aucune politique ni
--    fonction n'utilisait encore `inventory.view` (lecture du 2026-11-24):
--    rien d'autre ne change. Corps recopie du texte stocke en production.
-- 2. `assert_inventory_view(uuid)`, jumelle de `assert_inventory_edit`
--    (SECURITY INVOKER; service_role et super administrateur passent, sinon
--    `has_tenant_write_permission(..., 'inventory.view')`, qui exige aussi
--    d'etre membre actif du restaurant).
-- 3. Les quatre fonctions appellent `assert_inventory_view` a la place de
--    `assert_tenant_member`. Corps recopies du texte STOCKE en production
--    (lu le 2026-11-24, `lot-b2b1/prod-fonctions.sql`); droits reposes a
--    l'identique (EXECUTE a authenticated et service_role).
--
-- ORDRE DE DEPLOIEMENT: AVANT ou APRES le code en ligne. Tous les appelants
-- applicatifs sont deja gardes par `inventory.view`, avec la meme resolution
-- (role, surcharge du role, surcharge individuelle).
--
-- ROLLBACK: rejouer les cinq corps de prod-fonctions.sql, puis
--   DROP FUNCTION IF EXISTS public.assert_inventory_view(uuid);
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.has_tenant_write_permission(p_tenant uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.role_permissions rp
      ON rp.tenant_id = au.tenant_id AND rp.role = au.role
    WHERE au.user_id = (SELECT auth.uid())
      AND au.tenant_id = p_tenant
      AND (au.is_active IS NULL OR au.is_active = true)
      AND au.deleted_at IS NULL
      AND (
        au.role = 'owner'
        OR CASE
             -- Surcharge individuelle de l'employe: elle tranche, dans les
             -- deux sens, pour n'importe quel role.
             WHEN au.custom_permissions ? p_perm
               THEN (au.custom_permissions -> p_perm) = 'true'::jsonb
             -- Puis la surcharge de role posee par le proprietaire.
             WHEN rp.permissions ? p_perm
               THEN (rp.permissions -> p_perm) = 'true'::jsonb
             -- Sans surcharge: DEFAULT_PERMISSIONS (src/types/permission.types.ts).
             ELSE CASE p_perm
                    WHEN 'orders.manage'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'cashier', 'chef', 'waiter'])
                    WHEN 'orders.pay'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'cashier'])
                    WHEN 'settings.edit'
                      THEN au.role = 'admin'
                    WHEN 'menu.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    WHEN 'inventory.edit'
                      THEN au.role = ANY (ARRAY['admin', 'manager'])
                    -- B127: DEFAULT_PERMISSIONS donne aussi la lecture du stock
                    -- au chef (permission.types.ts), pas au caissier ni au serveur.
                    WHEN 'inventory.view'
                      THEN au.role = ANY (ARRAY['admin', 'manager', 'chef'])
                    ELSE au.role = ANY (ARRAY['admin', 'manager'])
                  END
           END
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.assert_inventory_view(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF public.is_super_admin() THEN
    RETURN;
  END IF;
  IF public.has_tenant_write_permission(p_tenant_id, 'inventory.view') THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'access denied: inventory.view required on tenant %', p_tenant_id
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_inventory_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_inventory_view(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_losses_by_reason(p_tenant_id uuid, p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(reason_code text, nb_movements bigint, total_qty numeric, total_cost_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_inventory_view(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.reason_code,
    COUNT(*)::bigint,
    COALESCE(SUM(ABS(sm.quantity)), 0),
    COALESCE(SUM(ABS(sm.quantity) * i.cost_per_unit), 0)
  FROM public.stock_movements sm
  JOIN public.ingredients i
    ON i.id = sm.ingredient_id AND i.tenant_id = sm.tenant_id
  WHERE sm.tenant_id = p_tenant_id
    AND sm.movement_type = 'loss'
    AND (p_start IS NULL OR sm.created_at >= p_start)
    AND (p_end   IS NULL OR sm.created_at <= p_end)
  GROUP BY sm.reason_code
  ORDER BY 4 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_stock_movements_page(p_tenant_id uuid, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, tenant_id uuid, ingredient_id uuid, movement_type text, quantity numeric, reference_id uuid, notes text, reason_code text, created_by uuid, supplier_id uuid, created_at timestamp with time zone, ingredient_name text, ingredient_unit text, supplier_name text, author_name text, order_number text, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_inventory_view(p_tenant_id);
  RETURN QUERY
  SELECT
    sm.id, sm.tenant_id, sm.ingredient_id, sm.movement_type, sm.quantity,
    sm.reference_id, sm.notes, sm.reason_code, sm.created_by, sm.supplier_id, sm.created_at,
    (SELECT i.name FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_name,
    (SELECT i.unit FROM public.ingredients i WHERE i.id = sm.ingredient_id) AS ingredient_unit,
    (SELECT s.name FROM public.suppliers s WHERE s.id = sm.supplier_id) AS supplier_name,
    (SELECT au.full_name FROM public.admin_users au
       WHERE au.user_id = sm.created_by AND au.tenant_id = sm.tenant_id
       LIMIT 1) AS author_name,
    -- Tenant-scope la jointure: reference_id seul pourrait designer la commande
    -- d'un autre restaurant si un uuid etait devine.
    CASE WHEN sm.movement_type IN ('order_destock', 'order_restock') THEN
      (SELECT o.order_number FROM public.orders o
         WHERE o.id = sm.reference_id AND o.tenant_id = sm.tenant_id)
    END AS order_number,
    COUNT(*) OVER() AS total_count
  FROM public.stock_movements sm
  WHERE sm.tenant_id = p_tenant_id
  ORDER BY sm.created_at DESC, sm.id DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_stock_status(p_tenant_id uuid)
 RETURNS TABLE(id uuid, name text, unit text, current_stock numeric, min_stock_alert numeric, cost_per_unit numeric, category text, is_active boolean, nb_items_using bigint, is_low boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_inventory_view(p_tenant_id);
  RETURN QUERY
  SELECT
    i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
    i.cost_per_unit, i.category, i.is_active,
    COUNT(DISTINCT r.menu_item_id) AS nb_items_using,
    (i.current_stock <= 0
      OR (i.min_stock_alert > 0 AND i.current_stock <= i.min_stock_alert)) AS is_low
  FROM public.ingredients i
  LEFT JOIN public.recipes r ON r.ingredient_id = i.id AND r.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id AND i.is_active = true
  GROUP BY i.id, i.name, i.unit, i.current_stock, i.min_stock_alert,
           i.cost_per_unit, i.category, i.is_active
  ORDER BY i.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_stock_ledger(p_tenant_id uuid)
 RETURNS TABLE(ingredient_id uuid, name text, current_stock numeric, ledger_sum numeric, drift numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_inventory_view(p_tenant_id);
  RETURN QUERY
  SELECT
    i.id,
    i.name,
    i.current_stock,
    COALESCE(SUM(sm.quantity), 0)::numeric(10, 3),
    (i.current_stock - COALESCE(SUM(sm.quantity), 0))::numeric(10, 3)
  FROM public.ingredients i
  LEFT JOIN public.stock_movements sm
    ON sm.ingredient_id = i.id AND sm.tenant_id = p_tenant_id
  WHERE i.tenant_id = p_tenant_id AND i.is_active = true
  GROUP BY i.id, i.name, i.current_stock
  HAVING (i.current_stock - COALESCE(SUM(sm.quantity), 0)) <> 0
  ORDER BY i.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_losses_by_reason(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_losses_by_reason(uuid, timestamptz, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_stock_movements_page(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_movements_page(uuid, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_stock_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_status(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.verify_stock_ledger(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_stock_ledger(uuid) TO authenticated, service_role;

COMMIT;
