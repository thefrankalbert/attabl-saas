// Types commandes & tarification pour l'administration multi-tenant ATTABL SaaS

import type {
  CurrencyCode,
  Course,
  ItemStatus,
  OrderPreparationZone,
  OrderStatus,
  PaymentStatus,
  PreparationZone,
  ServiceType,
} from './enums.types';

type PaymentMethod = 'cash' | 'card' | 'wave' | 'orange_money' | 'mtn_momo' | 'free_money';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  menu_item_id?: string;
  notes?: string;
  // --- Production upgrade --------------------------------
  customer_notes?: string;
  item_status?: ItemStatus;
  course?: Course;
  modifiers?: Array<{ name: string; price: number }>;
  // --- Preparation zone (denormalized from category) ----
  preparation_zone?: PreparationZone;
  // --- KDS fire/hold (coursing) --------------------------
  held?: boolean;
  fired_at?: string;
}

export interface Order {
  id: string;
  tenant_id: string;
  order_number?: string;
  table_number: string;
  total_price: number; // mapped from DB column `total`
  total?: number;
  total_amount?: number;
  status: OrderStatus;
  created_at: string;
  venue_id?: string;
  table_id?: string;
  items?: OrderItem[];
  notes?: string;
  customer_name?: string;
  customer_phone?: string;
  // --- Service type & metadata ---------------------------
  service_type?: ServiceType;
  room_number?: string;
  delivery_address?: string;
  // --- Financial breakdown -------------------------------
  subtotal?: number;
  tax_amount?: number;
  service_charge_amount?: number;
  discount_amount?: number;
  tip_amount?: number;
  // --- Payment tracking ---------------------------------
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  paid_at?: string;
  // --- Comp / offert (order closed for free) ------------
  is_comp?: boolean;
  comp_reason?: string;
  comp_amount?: number;
  house_account_id?: string;
  // --- Currency -----------------------------------------
  display_currency?: CurrencyCode;
  // --- Coupon --------------------------------------------
  coupon_id?: string;
  // --- Preparation zone routing ------------------------
  preparation_zone?: OrderPreparationZone;
  // Waiter assignment
  server_id?: string;
  cashier_id?: string;
  assigned_to?: string;
  server?: { id: string; full_name: string; role: string };
}

// --- Pricing -----------------------------------------------
export interface PricingBreakdown {
  subtotal: number;
  taxAmount: number;
  serviceChargeAmount: number;
  discountAmount: number;
  total: number;
}
