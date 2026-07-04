// Shared types for the Reports admin surface. These mirror the shapes returned
// by useReportData (src/hooks/queries/useReportData.ts) and are used to type the
// props passed down to the extracted Reports sub-components.

export type Period = 'today' | '7d' | '30d' | '90d' | 'thisMonth' | 'lastMonth' | 'thisYear';

export interface DailyStats {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopItem {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface CategoryBreakdown {
  category: string;
  revenue: number;
  percentage: number;
}

export interface ServerStats {
  serverName: string;
  orders: number;
  revenue: number;
  avgOrder: number;
}

export interface ReportSummary {
  revenue: number;
  orders: number;
  avgBasket: number;
}

/** Currency formatter for integer MINOR-unit amounts. */
export type CurrencyFormatter = (amount: number) => string;

/** Pill-style period options for the tab selector */
export const PERIOD_PILLS: { value: Period; labelKey: string }[] = [
  { value: 'today', labelKey: 'periodToday' },
  { value: '7d', labelKey: 'last7Days' },
  { value: '30d', labelKey: 'last30Days' },
  { value: '90d', labelKey: 'last90Days' },
];
