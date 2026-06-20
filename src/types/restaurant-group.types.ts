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
