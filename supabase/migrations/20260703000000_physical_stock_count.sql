-- Physical stock count + variance (back-office stock program, phase 4 - #12).
--
-- ERPNext-style stock reconciliation: open a count (snapshots the theoretical
-- current_stock per active ingredient), enter counted quantities, commit to
-- generate physical_count ledger movements for the REAL applied delta.
--
-- ADDITIVE ONLY. Depends on the ledger chantier (phase 2).
-- NOTE: the stock_movements.movement_type CHECK is NOT touched here - the ledger
--   migration is its SOLE owner and already allows 'physical_count' (+ loss /
--   transfer_in / transfer_out). Re-stating it would risk dropping those values.
-- Rollback: DROP the 4 RPCs, the 2 tables (CASCADE), done.

BEGIN;

-- 1. stock_counts (a counting session) --------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'committed', 'cancelled')),
  created_by UUID,
  committed_by UUID,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_counts_tenant ON public.stock_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_counts_tenant_status ON public.stock_counts(tenant_id, status);
-- At most one open session per tenant (avoids overlapping snapshots).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_counts_one_open
  ON public.stock_counts(tenant_id) WHERE status = 'open';

-- 2. stock_count_lines ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_count_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  count_id UUID NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  theoretical_qty NUMERIC(10, 3) NOT NULL DEFAULT 0,
  counted_qty NUMERIC(10, 3),
  variance NUMERIC(10, 3) GENERATED ALWAYS AS (counted_qty - theoretical_qty) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (count_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_tenant ON public.stock_count_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count ON public.stock_count_lines(count_id);
CREATE INDEX IF NOT EXISTS idx_stock_count_lines_ingredient ON public.stock_count_lines(ingredient_id);

-- 3. updated_at trigger (reuse the existing shared trigger fn) ---------------------
DROP TRIGGER IF EXISTS trigger_stock_counts_updated_at ON public.stock_counts;
CREATE TRIGGER trigger_stock_counts_updated_at
  BEFORE UPDATE ON public.stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_ingredients_updated_at();

-- 4. RLS: tenant-scoped via get_my_tenant_ids_array() -----------------------------
-- Same canonical, initplan-safe pattern as the primary ingredients policies
-- (the helper is SECDEF + STABLE, so it is evaluated once per query, not per row).
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_counts_select ON public.stock_counts FOR SELECT
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
CREATE POLICY stock_counts_insert ON public.stock_counts FOR INSERT
  WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));
CREATE POLICY stock_counts_update ON public.stock_counts FOR UPDATE
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()))
  WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));
CREATE POLICY stock_counts_delete ON public.stock_counts FOR DELETE
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

CREATE POLICY stock_count_lines_select ON public.stock_count_lines FOR SELECT
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));
CREATE POLICY stock_count_lines_insert ON public.stock_count_lines FOR INSERT
  WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));
CREATE POLICY stock_count_lines_update ON public.stock_count_lines FOR UPDATE
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()))
  WITH CHECK (tenant_id = ANY (public.get_my_tenant_ids_array()));
CREATE POLICY stock_count_lines_delete ON public.stock_count_lines FOR DELETE
  USING (tenant_id = ANY (public.get_my_tenant_ids_array()));

-- 5. open_stock_count: snapshot theoretical for active ingredients ----------------
CREATE OR REPLACE FUNCTION public.open_stock_count(
  p_tenant_id uuid,
  p_reference text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_ingredient_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_count_id uuid;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  IF EXISTS (SELECT 1 FROM public.stock_counts WHERE tenant_id = p_tenant_id AND status = 'open') THEN
    RAISE EXCEPTION 'OPEN_COUNT_EXISTS' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stock_counts (tenant_id, reference, status, created_by)
  VALUES (p_tenant_id, NULLIF(p_reference, ''), 'open', p_created_by)
  RETURNING id INTO v_count_id;

  INSERT INTO public.stock_count_lines (tenant_id, count_id, ingredient_id, theoretical_qty)
  SELECT p_tenant_id, v_count_id, i.id, i.current_stock
  FROM public.ingredients i
  WHERE i.tenant_id = p_tenant_id
    AND i.is_active = true
    AND (p_ingredient_ids IS NULL OR i.id = ANY (p_ingredient_ids));

  IF NOT EXISTS (SELECT 1 FROM public.stock_count_lines WHERE count_id = v_count_id) THEN
    RAISE EXCEPTION 'NO_INGREDIENTS' USING ERRCODE = '22023';
  END IF;

  RETURN v_count_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.open_stock_count(uuid, text, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_stock_count(uuid, text, uuid, uuid[]) TO authenticated, service_role;

-- 6. save_stock_count_lines: batch-set counted quantities (open only) --------------
CREATE OR REPLACE FUNCTION public.save_stock_count_lines(
  p_tenant_id uuid,
  p_count_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_line jsonb;
  v_status text;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_NOT_OPEN' USING ERRCODE = '22023'; END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    IF (v_line->>'counted_qty') IS NOT NULL AND (v_line->>'counted_qty')::numeric < 0 THEN
      RAISE EXCEPTION 'INVALID_COUNTED_QTY' USING ERRCODE = '22023';
    END IF;
    UPDATE public.stock_count_lines
      SET counted_qty = NULLIF(v_line->>'counted_qty', '')::numeric
      WHERE count_id = p_count_id
        AND tenant_id = p_tenant_id
        AND ingredient_id = (v_line->>'ingredient_id')::uuid;
  END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION public.save_stock_count_lines(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_stock_count_lines(uuid, uuid, jsonb) TO authenticated, service_role;

-- 7. commit_stock_count: apply against LIVE stock, book physical_count deltas ------
-- Delta is computed against the CURRENT current_stock (FOR UPDATE) at commit time,
-- NOT the open-time snapshot, so SUM(stock_movements.quantity) keeps reconstructing
-- current_stock even if stock moved between open and commit. Idempotent via status.
CREATE OR REPLACE FUNCTION public.commit_stock_count(
  p_tenant_id uuid,
  p_count_id uuid,
  p_committed_by uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status text;
  v_line RECORD;
  v_before NUMERIC(10, 3);
  v_delta NUMERIC(10, 3);
  v_n INT := 0;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_ALREADY_CLOSED' USING ERRCODE = '22023'; END IF;

  FOR v_line IN
    SELECT scl.ingredient_id, scl.counted_qty
    FROM public.stock_count_lines scl
    WHERE scl.count_id = p_count_id
      AND scl.tenant_id = p_tenant_id
      AND scl.counted_qty IS NOT NULL
  LOOP
    SELECT current_stock INTO v_before FROM public.ingredients
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id
      FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_delta := v_line.counted_qty - v_before;
    IF v_delta = 0 THEN CONTINUE; END IF;

    UPDATE public.ingredients SET current_stock = v_line.counted_qty, updated_at = now()
      WHERE id = v_line.ingredient_id AND tenant_id = p_tenant_id;

    INSERT INTO public.stock_movements
      (tenant_id, ingredient_id, movement_type, quantity, reference_id, notes, created_by)
    VALUES
      (p_tenant_id, v_line.ingredient_id, 'physical_count', v_delta, p_count_id,
       'Inventaire physique', p_committed_by);

    IF v_line.counted_qty <= 0 THEN
      UPDATE public.menu_items SET is_available = false
        WHERE tenant_id = p_tenant_id AND is_available = true AND id IN (
          SELECT r.menu_item_id FROM public.recipes r
          WHERE r.ingredient_id = v_line.ingredient_id AND r.tenant_id = p_tenant_id);
    ELSE
      UPDATE public.menu_items SET is_available = true
        WHERE tenant_id = p_tenant_id AND is_available = false AND id IN (
          SELECT r.menu_item_id FROM public.recipes r
          WHERE r.ingredient_id = v_line.ingredient_id AND r.tenant_id = p_tenant_id);
    END IF;

    v_n := v_n + 1;
  END LOOP;

  UPDATE public.stock_counts
    SET status = 'committed', committed_at = now(), committed_by = p_committed_by, updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;

  RETURN v_n;
END;
$fn$;
REVOKE ALL ON FUNCTION public.commit_stock_count(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_stock_count(uuid, uuid, uuid) TO authenticated, service_role;

-- 8. cancel_stock_count: release an open session ----------------------------------
CREATE OR REPLACE FUNCTION public.cancel_stock_count(
  p_tenant_id uuid,
  p_count_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status text;
BEGIN
  PERFORM public.assert_tenant_member(p_tenant_id);
  SELECT status INTO v_status FROM public.stock_counts
    WHERE id = p_count_id AND tenant_id = p_tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUNT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'COUNT_NOT_OPEN' USING ERRCODE = '22023'; END IF;
  UPDATE public.stock_counts SET status = 'cancelled', updated_at = now()
    WHERE id = p_count_id AND tenant_id = p_tenant_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.cancel_stock_count(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_count(uuid, uuid) TO authenticated, service_role;

COMMIT;
