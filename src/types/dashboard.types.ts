interface DashboardDayBucket {
  date: string;
  revenue: number;
  count: number;
}

export interface DashboardBucketSeries {
  week: DashboardDayBucket[];
  month: DashboardDayBucket[];
  quarter: DashboardDayBucket[];
}

/** Revenue split by sales channel for a single day. */
interface DashboardChannelBucket {
  date: string;
  /** Sur place: dine_in + room_service */
  surplace: number;
  /** A emporter: takeaway + delivery */
  emporter: number;
}

export interface DashboardChannelSeries {
  week: DashboardChannelBucket[];
  month: DashboardChannelBucket[];
  quarter: DashboardChannelBucket[];
}

export interface TopDishRecord {
  id: string;
  name: string;
  category: string;
  portions: number;
  revenue: number;
  dayCounts: Record<string, number>;
  color: 'violet' | 'indigo' | 'rose' | 'amber';
  initials: string;
  available: boolean;
}

export interface StockAlertRecord {
  id: string;
  level: 'ok' | 'warn' | 'err';
  title: string;
  current: number;
  threshold: number;
  unit: string;
}
