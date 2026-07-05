// Types tenant & utilisateurs admin pour l'administration multi-tenant ATTABL SaaS

import type { SubscriptionPlan, SubscriptionStatus, BillingInterval } from '@/types/billing';
import type { AdminRole, CurrencyCode } from './enums.types';

// --- Types principaux (avec tenant_id) ---------------------

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
  // --- Subscription fields ------------------------------
  subscription_plan?: SubscriptionPlan;
  subscription_status?: SubscriptionStatus;
  trial_ends_at?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  billing_interval?: BillingInterval;
  // --- Business config ----------------------------------
  currency?: CurrencyCode;
  supported_currencies?: CurrencyCode[];
  tax_rate?: number;
  service_charge_rate?: number;
  enable_tax?: boolean;
  enable_service_charge?: boolean;
  enable_coupons?: boolean;
  // --- Establishment -----------------------------------
  establishment_type?: string;
  city?: string;
  country?: string;
  table_count?: number;
  onboarding_completed?: boolean;
  // --- Extras --------------------------------------------
  description?: string;
  address?: string;
  phone?: string;
  notification_sound_id?: string;
  idle_timeout_minutes?: number | null;
  screen_lock_mode?: 'overlay' | 'password';
  bar_display_enabled?: boolean;
  // --- Opening hours -------------------------------------
  opening_hours?: OpeningHoursMap | null;
  // --- Custom domain -------------------------------------
  custom_domain?: string | null;
  // --- Payment methods -----------------------------------
  enabled_payment_methods?: string[];
  // --- Behavioral tracking -------------------------------
  activation_events?: Record<string, string>;
  last_active_at?: string | null;
}

export type OpeningHoursDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type OpeningHoursMap = Partial<Record<OpeningHoursDay, { open: string; close: string }>>;

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
