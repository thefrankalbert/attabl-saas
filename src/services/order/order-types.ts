import type { OrderItemInput } from '@/lib/validations/order.schema';
import type { ServiceType, OrderPreparationZone, PreparationZone } from '@/types/admin.types';

export interface CreateOrderInput {
  tenantId: string;
  items: OrderItemInput[];
  total: number;
  tableNumber?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  // ─── Production upgrade ────────────────────────────────
  service_type?: ServiceType;
  room_number?: string;
  delivery_address?: string;
  subtotal?: number;
  tax_amount?: number;
  service_charge_amount?: number;
  discount_amount?: number;
  tip_amount?: number;
  coupon_id?: string;
  server_id?: string;
  display_currency?: string;
  verifiedPrices?: Map<string, number>;
  preparation_zone?: OrderPreparationZone;
  /** Per-item preparation zone, keyed by menu_item_id. Denormalized from category at order time. */
  itemPreparationZones?: Map<string, PreparationZone>;
  /** Idempotency key minted client-side. Dedupes offline-replayed order creation. */
  clientRequestId?: string;
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  /** Order total in integer MINOR units (the value stored in orders.total). */
  total: number;
  /**
   * True when the DB function returned an already-existing order for the
   * idempotency key (concurrent replay deduped at the unique index) instead of
   * inserting a new one. The caller MUST then skip non-idempotent side effects
   * (coupon claim, destock, notifications) - the winning request already ran them.
   */
  deduplicated?: boolean;
}

export type OrderPreviewIssue = {
  itemId: string;
  message: string;
  /** Client should remove this line from the cart (deleted or unavailable item). */
  removeFromCart: boolean;
};

export type OrderPreviewResult = {
  valid: boolean;
  issues: OrderPreviewIssue[];
  invalidItemIds: string[];
  validatedSubtotal: number;
  verifiedPrices: Map<string, number>;
  categoryIds: string[];
  itemCategoryMap: Map<string, string>;
};

export interface TenantValidationResult {
  id: string;
  currency: string | null;
  tax_rate: number | null;
  service_charge_rate: number | null;
  enable_tax: boolean | null;
  enable_service_charge: boolean | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
}
