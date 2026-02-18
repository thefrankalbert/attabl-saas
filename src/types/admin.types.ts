// Types pour l'administration multi-tenant ATTABL SaaS
// Adapté de BluTable avec support tenant_id

// ─── Rôles d'administration ────────────────────────────────
export type AdminRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'chef' | 'waiter';

export const ROLE_DESCRIPTIONS: Record<
  AdminRole,
  { label: string; description: string; level: number }
> = {
  owner: {
    label: 'Propriétaire',
    description: 'Accès complet - propriétaire du restaurant',
    level: 100,
  },
  admin: {
    label: 'Administrateur',
    description: 'Gestion complète sauf suppression du tenant',
    level: 80,
  },
  manager: {
    label: 'Manager',
    description: 'Gestion opérationnelle complète',
    level: 60,
  },
  cashier: {
    label: 'Caissier',
    description: 'Caisse, paiements, factures, remboursements',
    level: 50,
  },
  chef: {
    label: 'Chef Cuisine',
    description: 'Réception et validation des commandes en cuisine',
    level: 40,
  },
  waiter: {
    label: 'Serveur',
    description: 'Prise de commandes et service',
    level: 20,
  },
} as const;

// ─── Statuts & Enums ─────────────────────────────────────────
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
export type ServiceType = 'dine_in' | 'takeaway' | 'delivery' | 'room_service';
export type PaymentMethod = 'cash' | 'card' | 'mobile_money';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';
export type ItemStatus = 'pending' | 'preparing' | 'ready' | 'served';
export type Course = 'appetizer' | 'main' | 'dessert' | 'drink';
export type CurrencyCode = 'XAF' | 'EUR' | 'USD';

// ─── Types principaux (avec tenant_id) ─────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  font_family?: string;
  is_active: boolean;
  created_at: string;
  // ─── Subscription fields ──────────────────────────────
  subscription_plan?: 'essentiel' | 'premium' | 'enterprise';
  subscription_status?: 'trial' | 'active' | 'past_due' | 'cancelled' | 'paused';
  trial_ends_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  billing_interval?: 'monthly' | 'yearly';
  // ─── Business config ──────────────────────────────────
  currency?: CurrencyCode;
  tax_rate?: number;
  service_charge_rate?: number;
  enable_tax?: boolean;
  enable_service_charge?: boolean;
  // ─── Extras ────────────────────────────────────────────
  description?: string;
  address?: string;
  phone?: string;
  notification_sound_id?: string;
}

export interface AdminUser {
  id: string;
  user_id: string;
  tenant_id: string;
  email: string;
  full_name?: string;
  phone?: string;
  role: AdminRole;
  is_active: boolean;
  last_login?: string;
  last_login_at?: string;
  login_count?: number;
  created_at: string;
  created_by?: string;
  custom_permissions?: Record<string, boolean> | null;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  menu_item_id?: string;
  notes?: string;
  // ─── Production upgrade ────────────────────────────────
  customer_notes?: string;
  item_status?: ItemStatus;
  course?: Course;
  modifiers?: Array<{ name: string; price: number }>;
}

export interface Order {
  id: string;
  tenant_id: string;
  order_number?: string;
  table_number: string;
  total_price: number;
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
  // ─── Service type & metadata ───────────────────────────
  service_type?: ServiceType;
  room_number?: string;
  delivery_address?: string;
  // ─── Financial breakdown ───────────────────────────────
  subtotal?: number;
  tax_amount?: number;
  service_charge_amount?: number;
  discount_amount?: number;
  // ─── Payment tracking ─────────────────────────────────
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  paid_at?: string;
  // ─── Coupon ────────────────────────────────────────────
  coupon_id?: string;
  // Waiter assignment
  server_id?: string;
  cashier_id?: string;
  assigned_to?: string;
  server?: { id: string; full_name: string; role: string };
}

// ─── Menus / Cartes ─────────────────────────────────────────

export interface Menu {
  id: string;
  tenant_id: string;
  venue_id: string | null;
  parent_menu_id: string | null;
  name: string;
  name_en?: string;
  slug: string;
  description?: string;
  description_en?: string;
  image_url?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at?: string;
  // Joined fields
  venue?: Venue;
  children?: Menu[];
  categories?: Category[];
}

// ─── Categories ─────────────────────────────────────────────

export interface Category {
  id: string;
  tenant_id: string;
  menu_id?: string;
  name: string;
  name_en?: string;
  display_order?: number;
  is_active?: boolean;
  created_at: string;
}

export interface MenuItem {
  id: string;
  tenant_id: string;
  name: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  price: number;
  image_url?: string;
  image_back_url?: string;
  is_available: boolean;
  is_featured: boolean;
  is_vegetarian?: boolean;
  is_spicy?: boolean;
  is_drink?: boolean;
  category_id: string;
  category?: Category;
  display_order?: number;
  created_at: string;
  options?: ItemOption[];
  price_variants?: ItemPriceVariant[];
  modifiers?: ItemModifier[];
}

// Option sélectionnable (ex: saveurs de jus - même prix)
export interface ItemOption {
  id: string;
  menu_item_id: string;
  name_fr: string;
  name_en?: string;
  display_order: number;
  is_default: boolean;
  created_at: string;
}

// Variante de prix (ex: Verre/Bouteille - prix différents)
export interface ItemPriceVariant {
  id: string;
  menu_item_id: string;
  variant_name_fr: string;
  variant_name_en?: string;
  price: number;
  display_order: number;
  is_default: boolean;
  created_at: string;
}

// Modificateur payant (ex: sauce truffe +5€, double portion +8€)
export interface ItemModifier {
  id: string;
  tenant_id: string;
  menu_item_id: string;
  name: string;
  name_en?: string;
  price: number;
  is_available: boolean;
  display_order: number;
  created_at: string;
}

// ─── Coupons ─────────────────────────────────────────────────

export interface Coupon {
  id: string;
  tenant_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount?: number;
  max_discount_amount?: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number;
  current_uses: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// ─── Promotions & Ads ────────────────────────────────────────

export interface Announcement {
  id: string;
  tenant_id: string;
  title: string;
  title_en?: string;
  description?: string;
  description_en?: string;
  image_url?: string;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  created_at: string;
}

export interface Ad {
  id: string;
  tenant_id: string;
  image_url: string;
  link?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ─── Dashboard ───────────────────────────────────────────────

export interface DashboardStats {
  ordersToday: number;
  revenueToday: number;
  activeItems: number;
  activeCards: number;
  ordersTrend?: number;
  revenueTrend?: number;
}

export interface PopularItem {
  id: string;
  name: string;
  image_url?: string;
  order_count: number;
}

// ─── Multi-venue ───────────────────────────────────────────

export interface Venue {
  id: string;
  tenant_id: string;
  name: string;
  name_en?: string;
  slug: string;
  description?: string;
  description_en?: string;
  image_url?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface Zone {
  id: string;
  venue_id: string;
  name: string;
  name_en?: string;
  prefix: string;
  description?: string;
  display_order: number;
  created_at: string;
}

export interface Table {
  id: string;
  zone_id: string;
  table_number: string;
  display_name: string;
  capacity: number;
  is_active: boolean;
  qr_code_url?: string;
  created_at: string;
  zone?: Zone;
}

export interface TableAssignment {
  id: string;
  tenant_id: string;
  table_id: string;
  server_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  // Joins
  server?: AdminUser;
  table?: Table;
}

// ─── Settings ──────────────────────────────────────────────

export interface Setting {
  id: string;
  tenant_id: string;
  key: string;
  value: unknown;
  description?: string;
  updated_at: string;
  created_at: string;
}

export interface SettingsMap {
  restaurant_name: string;
  currency: CurrencyCode;
  currency_symbol: string;
  default_language: 'fr' | 'en';
  notification_sound: boolean;
  auto_accept_orders: boolean;
  order_timeout_minutes: number;
}

// ─── Utility Types ─────────────────────────────────────────
export type WithId<T> = T & { id: string };
export type WithTimestamps<T> = T & { created_at: string; updated_at?: string };
export type Nullable<T> = T | null;

// ─── API Response Types ────────────────────────────────────
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─── Form Types ────────────────────────────────────────────
export type FormErrors<T> = Partial<Record<keyof T, string>>;

// ─── Language Support ──────────────────────────────────────
export type Language = 'fr' | 'en';

// ─── Pricing ───────────────────────────────────────────────
export interface PricingBreakdown {
  subtotal: number;
  taxAmount: number;
  serviceChargeAmount: number;
  discountAmount: number;
  total: number;
}
