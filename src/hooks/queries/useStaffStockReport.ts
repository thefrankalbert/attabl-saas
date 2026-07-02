'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { StaffStockReportRow } from '@/types/inventory.types';

export function useStaffStockReport(
  tenantId: string,
  startISO: string,
  endISO: string,
  enabled = true,
) {
  return useQuery<StaffStockReportRow[]>({
    queryKey: ['staff-stock-report', tenantId, startISO, endISO],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_staff_stock_report', {
        p_tenant_id: tenantId,
        p_start: startISO,
        p_end: endISO,
      });
      if (error) throw error;
      // PostgREST serializes numeric/bigint as strings; coerce so the typed
      // `number` fields are real numbers (safe to render + do math on).
      return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
        author_id: (r.author_id as string | null) ?? null,
        author_name: (r.author_name as string | null) ?? null,
        out_qty: Number(r.out_qty),
        in_qty: Number(r.in_qty),
        movements_count: Number(r.movements_count),
        manual_remove_qty: Number(r.manual_remove_qty),
        adjustment_out_qty: Number(r.adjustment_out_qty),
        order_destock_qty: Number(r.order_destock_qty),
      }));
    },
    enabled: !!tenantId && !!startISO && !!endISO && enabled,
    staleTime: 2 * 60 * 1000,
  });
}
