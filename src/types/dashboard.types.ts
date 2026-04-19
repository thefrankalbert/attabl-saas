export interface DashboardDayBucket {
  date: string;
  revenue: number;
  count: number;
}

export interface DashboardBucketSeries {
  week: DashboardDayBucket[];
  month: DashboardDayBucket[];
  quarter: DashboardDayBucket[];
}

export interface TopDishRecord {
  id: string;
  name: string;
  category: string;
  portions: number;
  revenue: number;
  dayCounts: Record<string, number>;
  color: 'lime' | 'indigo' | 'rose' | 'amber';
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
