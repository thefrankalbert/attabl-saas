export interface RestaurantGroup {
  id: string;
  owner_user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface OwnerDashboardRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_plan: string | null;
  tenant_status: string | null;
  tenant_logo_url: string | null;
  tenant_is_active: boolean;
  orders_today: number;
  revenue_today: number;
  orders_month: number;
  revenue_month: number;
}

export interface OwnerDashboardGlobals {
  totalRestaurants: number;
  totalOrdersToday: number;
  totalRevenueToday: number;
  totalOrdersMonth: number;
  totalRevenueMonth: number;
}
