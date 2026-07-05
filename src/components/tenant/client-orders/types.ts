// --- Types --------------------------------------------------

// Shape returned by the get_orders_for_tracking RPC (non-PII columns only).
export interface TrackedClientItemRow {
  item_name: string;
  item_name_en?: string | null;
  quantity: number;
  price_at_order: number;
  menu_item_id?: string | null;
  image_url?: string | null;
}

export interface TrackedClientRow {
  id: string;
  order_number: string;
  status: string;
  total: number;
  tip_amount: number | null;
  table_number: string | null;
  created_at: string;
  service_type: string | null;
  order_items: TrackedClientItemRow[] | null;
}

export interface OrderItem {
  name: string;
  name_en?: string;
  quantity: number;
  price: number;
  menu_item_id?: string;
  image_url?: string | null;
}

export interface OrderRecord {
  id: string;
  order_number: string;
  status: string;
  total: number;
  tip_amount: number;
  table_number: string | null;
  items: OrderItem[];
  created_at: string;
  service_type: string | null;
}

// Grand total actually paid (the stored `total` excludes the tip, which is a
// separate column - mirror the order detail / tracking screens).
export function grandTotal(o: { total: number; tip_amount: number }): number {
  return o.total + o.tip_amount;
}

export interface ClientOrdersProps {
  tenantSlug: string;
  tenantId: string;
  currency?: string;
  /** When true, shows terminal orders (history) instead of active ones */
  showHistory?: boolean;
}

// --- Constants ----------------------------------------------

export const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);
export const TERMINAL_STATUSES = new Set(['delivered', 'served', 'completed', 'cancelled']);

// --- Helpers ------------------------------------------------

export function getStoredOrderIds(tenantSlug: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    // Namespaced per tenant so customers who order from multiple ATTABL
    // restaurants on the same device don't see ID leak across tenants.
    return JSON.parse(localStorage.getItem(`attabl_${tenantSlug}_order_ids`) || '[]');
  } catch {
    return [];
  }
}
