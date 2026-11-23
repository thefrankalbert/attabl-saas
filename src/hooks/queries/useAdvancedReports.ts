'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { getDateRange } from './useReportData';
import type { Period } from '@/components/admin/reports/reports.types';

// Rapports avances (Business et plus). Chaque fonction SQL verifie
// l'appartenance puis le plan: un appel hors Business est refuse en base.

export interface DishMargin {
  itemId: string;
  name: string;
  quantity: number;
  /** Unites mineures. */
  revenue: number;
  hasRecipe: boolean;
  costComplete: boolean;
  /** Cout de fiche d'une portion, en unites MAJEURES (ingredients.cost_per_unit). */
  unitCost: number | null;
}

export interface HeatCell {
  /** 1 = lundi ... 7 = dimanche (ISO). */
  day: number;
  hour: number;
  revenue: number;
  orders: number;
}

export interface PaymentMethodRow {
  method: string;
  collected: number;
  refunded: number;
  net: number;
  count: number;
}

export interface LossRow {
  ingredientId: string;
  name: string;
  unit: string;
  quantity: number;
  /** Unites MAJEURES (cout unitaire actuel). */
  costValue: number;
  movements: number;
  mainReason: string | null;
}

export interface ComparisonRow {
  period: 'current' | 'previous';
  startAt: string;
  endAt: string;
  revenue: number;
  orders: number;
  avgBasket: number;
  tips: number;
}

export type ComparisonMode = 'week' | 'month';

const num = (v: unknown): number => Number(v) || 0;
const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export function parseDishMargins(data: unknown): DishMargin[] {
  return rows(data).map((r) => ({
    itemId: String(r.item_id),
    name: String(r.item_name),
    quantity: num(r.quantity_sold),
    revenue: num(r.revenue),
    hasRecipe: r.has_recipe === true,
    costComplete: r.cost_complete === true,
    unitCost: r.unit_cost === null || r.unit_cost === undefined ? null : num(r.unit_cost),
  }));
}

export function parseHeatmap(data: unknown): HeatCell[] {
  return rows(data).map((r) => ({
    day: num(r.day_of_week),
    hour: num(r.hour_of_day),
    revenue: num(r.revenue),
    orders: num(r.order_count),
  }));
}

export function parsePaymentMethods(data: unknown): PaymentMethodRow[] {
  return rows(data).map((r) => ({
    method: String(r.method),
    collected: num(r.collected),
    refunded: num(r.refunded),
    net: num(r.net),
    count: num(r.payment_count),
  }));
}

export function parseLosses(data: unknown): LossRow[] {
  return rows(data).map((r) => ({
    ingredientId: String(r.ingredient_id),
    name: String(r.ingredient_name),
    unit: String(r.unit),
    quantity: num(r.quantity),
    costValue: num(r.cost_value),
    movements: num(r.movement_count),
    mainReason: r.main_reason ? String(r.main_reason) : null,
  }));
}

export function parseComparison(data: unknown): ComparisonRow[] {
  return rows(data).map((r) => ({
    period: r.period === 'previous' ? 'previous' : 'current',
    startAt: String(r.start_at),
    endAt: String(r.end_at),
    revenue: num(r.revenue),
    orders: num(r.order_count),
    avgBasket: num(r.avg_basket),
    tips: num(r.tips),
  }));
}

export interface AdvancedReportData {
  margins: DishMargin[];
  heatmap: HeatCell[];
  methods: PaymentMethodRow[];
  losses: LossRow[];
}

async function rpcOrThrow(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createClient().rpc(name, args);
  if (error) {
    logger.error(`RPC failure in advanced reports: ${name}`, error);
    throw error;
  }
  return data;
}

/** Les quatre rapports qui suivent la periode choisie. */
export function useAdvancedReports(tenantId: string, period: Period, timezone: string) {
  return useQuery<AdvancedReportData>({
    queryKey: ['advanced-reports', tenantId, period, timezone],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange(period, timezone);
      const range = { p_tenant_id: tenantId, p_start_date: startDate, p_end_date: endDate };
      const [margins, heatmap, methods, losses] = await Promise.all([
        rpcOrThrow('get_dish_margins', range),
        rpcOrThrow('get_sales_heatmap', { ...range, p_timezone: timezone }),
        rpcOrThrow('get_payment_method_report', range),
        rpcOrThrow('get_stock_losses_report', range),
      ]);
      return {
        margins: parseDishMargins(margins),
        heatmap: parseHeatmap(heatmap),
        methods: parsePaymentMethods(methods),
        losses: parseLosses(losses),
      };
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });
}

/** Comparaison semaine contre semaine, ou mois contre mois (heure du restaurant). */
export function usePeriodComparison(tenantId: string, mode: ComparisonMode, timezone: string) {
  return useQuery<ComparisonRow[]>({
    queryKey: ['period-comparison', tenantId, mode, timezone],
    queryFn: async () =>
      parseComparison(
        await rpcOrThrow('get_period_comparison', {
          p_tenant_id: tenantId,
          p_mode: mode,
          p_timezone: timezone,
        }),
      ),
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });
}
