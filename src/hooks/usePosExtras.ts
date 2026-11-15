'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { CurrencyCode, Zone, Table } from '@/types/admin.types';

export interface POSSuggestion {
  menu_item_id: string;
  suggested_item_id: string;
  suggested_item_name: string;
  suggestion_type: string;
  description: string | null;
}

interface TaxConfig {
  enableTax: boolean;
  taxRate: number;
  enableServiceCharge: boolean;
  serviceChargeRate: number;
}

interface PosExtras {
  currency: CurrencyCode;
  taxConfig: TaxConfig;
  enableCoupons: boolean;
  suggestions: POSSuggestion[];
  zones: Zone[];
  allTables: Table[];
}

const NO_TAX: TaxConfig = {
  enableTax: false,
  taxRate: 0,
  enableServiceCharge: false,
  serviceChargeRate: 0,
};
const NONE: never[] = [];

async function fetchPosExtras(tenantId: string): Promise<PosExtras> {
  const supabase = createClient();
  const [tenantRes, suggestionsRes, zonesRes] = await Promise.all([
    supabase
      .from('tenants')
      .select(
        'currency, enable_tax, tax_rate, enable_service_charge, service_charge_rate, enable_coupons',
      )
      .eq('id', tenantId)
      .single(),
    supabase
      .from('item_suggestions')
      .select(
        'menu_item_id, suggested_item_id, suggestion_type, description, suggested_item:menu_items!item_suggestions_suggested_item_id_fkey(name)',
      )
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    // Tenant-scoped via venues join: a tenant can have several venues and the
    // dine-in picker must list every zone, not just the first venue's.
    supabase
      .from('zones')
      .select('*, venues!inner(tenant_id)')
      .eq('venues.tenant_id', tenantId)
      .order('display_order'),
  ]);
  if (tenantRes.error) throw tenantRes.error;
  if (zonesRes.error) throw zonesRes.error;

  const zones = (zonesRes.data ?? []) as Zone[];
  let allTables: Table[] = [];
  if (zones.length > 0) {
    const { data: tablesData, error: tablesError } = await supabase
      .from('tables')
      .select('*')
      .in(
        'zone_id',
        zones.map((z) => z.id),
      )
      .eq('is_active', true)
      .order('table_number');
    if (tablesError) throw tablesError;
    allTables = (tablesData ?? []) as Table[];
  }

  const tenant = tenantRes.data;
  return {
    currency: (tenant.currency as CurrencyCode) || 'XAF',
    taxConfig: {
      enableTax: !!tenant.enable_tax,
      taxRate: (tenant.tax_rate as number) || 0,
      enableServiceCharge: !!tenant.enable_service_charge,
      serviceChargeRate: (tenant.service_charge_rate as number) || 0,
    },
    enableCoupons: !!tenant.enable_coupons,
    // Suggestions are an optional enhancement: a failure there never blocks.
    suggestions: (suggestionsRes.data ?? []).map((s: Record<string, unknown>) => ({
      menu_item_id: s.menu_item_id as string,
      suggested_item_id: s.suggested_item_id as string,
      suggested_item_name: ((s.suggested_item as Record<string, unknown>)?.name as string) || '',
      suggestion_type: s.suggestion_type as string,
      description: s.description as string | null,
    })),
    zones,
    allTables,
  };
}

/**
 * Restaurant settings the till needs (currency, taxes, coupons switch), item
 * suggestions, and the zones/tables of the dine-in picker.
 *
 * A TanStack query, so it is persisted with the rest of the offline cache: a
 * till opened during a network cut works on the last known settings (the
 * outbox exists for exactly that) instead of refusing every sale. Only a till
 * that never loaded them (`!extrasLoaded`) must wait: it cannot know the taxes
 * and would quote a wrong amount. Refetched on reconnect by the query client.
 */
export function usePosExtras(tenantId: string) {
  const query = useQuery({
    queryKey: ['pos-extras', tenantId],
    queryFn: () => fetchPosExtras(tenantId),
  });
  const data = query.data;

  return {
    currency: data?.currency ?? 'XAF',
    taxConfig: data?.taxConfig ?? NO_TAX,
    enableCoupons: data?.enableCoupons ?? false,
    suggestions: data?.suggestions ?? (NONE as POSSuggestion[]),
    zones: data?.zones ?? (NONE as Zone[]),
    allTables: data?.allTables ?? (NONE as Table[]),
    /** Settings known (fresh or from the offline cache): orders may go. */
    extrasLoaded: data !== undefined,
    /** Never loaded and the last attempt failed: say so and offer a retry. */
    // Offline, TanStack pauses the fetch instead of failing: same message.
    extrasError: data === undefined && (query.isError || query.fetchStatus === 'paused'),
    retryExtras: () => void query.refetch(),
  };
}
