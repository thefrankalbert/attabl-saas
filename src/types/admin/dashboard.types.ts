// Types dashboard & statistiques pour l'administration multi-tenant ATTABL SaaS

// --- Dashboard -----------------------------------------------

export interface DashboardStats {
  ordersToday: number;
  revenueToday: number;
  activeItems: number;
  activeCards: number;
  ordersTrend?: number;
  revenueTrend?: number;
}

export interface CategoryBreakdown {
  name: string;
  value: number;
  color: string;
}

export interface HourlyOrderCount {
  hour: string; // "8h", "10h", etc.
  count: number;
}

export interface SparklinePoint {
  value: number;
}

export interface PopularItem {
  id: string;
  name: string;
  image_url?: string;
  order_count: number;
}
