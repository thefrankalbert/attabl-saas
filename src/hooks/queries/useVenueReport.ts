'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { getDateRange } from './useReportData';
import type { Period } from '@/components/admin/reports/reports.types';

/** Une ligne de comparaison: un espace du restaurant, ou "sans espace" (venueId null). */
export interface VenueRow {
  venueId: string | null;
  venueName: string | null;
  /** Unites mineures (registre payments, pourboire compris). */
  revenue: number;
  orders: number;
  avgBasket: number;
}

/** Cle stable d'une ligne (la ligne "sans espace" a venueId null). */
export const venueKey = (row: { venueId: string | null }): string => row.venueId ?? '__none__';

export interface VenueTopItem {
  venueId: string | null;
  itemId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface VenueReportData {
  rows: VenueRow[];
  topItems: VenueTopItem[];
}

/** Normalise get_venue_report (BIGINT -> number). */
export function parseVenueRows(data: unknown): VenueRow[] {
  if (!Array.isArray(data)) return [];
  return (
    data as {
      venue_id: string | null;
      venue_name: string | null;
      revenue: number;
      order_count: number;
      avg_basket: number;
    }[]
  ).map((r) => ({
    venueId: r.venue_id,
    venueName: r.venue_name,
    revenue: Number(r.revenue) || 0,
    orders: Number(r.order_count) || 0,
    avgBasket: Number(r.avg_basket) || 0,
  }));
}

/** Normalise get_venue_top_items. */
export function parseVenueTopItems(data: unknown): VenueTopItem[] {
  if (!Array.isArray(data)) return [];
  return (
    data as {
      venue_id: string | null;
      item_id: string;
      item_name: string;
      quantity_sold: number;
      revenue: number;
    }[]
  ).map((r) => ({
    venueId: r.venue_id,
    itemId: r.item_id,
    name: r.item_name,
    quantity: Number(r.quantity_sold) || 0,
    revenue: Number(r.revenue) || 0,
  }));
}

/**
 * Rapports par espace (Business et plus). Les deux fonctions SQL verifient
 * l'appartenance puis le plan: un appel hors Business est refuse en base.
 */
export function useVenueReport(tenantId: string, period: Period) {
  return useQuery<VenueReportData>({
    queryKey: ['venue-report', tenantId, period],
    queryFn: async () => {
      const supabase = createClient();
      const { startDate, endDate } = getDateRange(period);
      const range = { p_tenant_id: tenantId, p_start_date: startDate, p_end_date: endDate };
      const [rowsRes, topRes] = await Promise.all([
        supabase.rpc('get_venue_report', range),
        supabase.rpc('get_venue_top_items', { ...range, p_limit: 5 }),
      ]);
      const error = rowsRes.error || topRes.error;
      if (error) {
        logger.error('RPC failure in venue report', error);
        throw error;
      }
      return { rows: parseVenueRows(rowsRes.data), topItems: parseVenueTopItems(topRes.data) };
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });
}
