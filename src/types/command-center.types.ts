import type { OwnerDashboardRow } from './restaurant-group.types';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  subscription_status: string;
  subscription_plan: string;
  is_active: boolean;
}

export interface ChartDataPoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface RecentOrder {
  id: string;
  order_number: string;
  total: number;
  status: string;
  created_at: string;
  tenant_name: string;
  tenant_slug: string;
}

export type ChartPeriod = 'day' | 'week' | 'month';
export type ChartMode = 'revenue' | 'orders';

export interface LocationStat {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  tenant_plan: string | null;
  tenant_logo_url: string | null;
  is_active: boolean;
  revenue_today: number;
  revenue_yesterday: number;
  orders_today: number;
  orders_yesterday: number;
  sparkline: number[];
}

export interface CommandCenterAlert {
  id: string;
  kind: 'stock' | 'offline' | 'payment' | 'pending';
  label: string;
  tenant_name: string;
  tenant_slug: string;
  severity: 'warn' | 'error' | 'info';
  created_at: string;
}

export interface CommandCenterGlobals {
  total_locations: number;
  active_locations: number;
  revenue_today: number;
  revenue_yesterday: number;
  orders_today: number;
  orders_yesterday: number;
  alerts_count: number;
}

export type LocationRow = OwnerDashboardRow;
