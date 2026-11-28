/**
 * Shared shapes for the super-admin (god-mode) Command Center console.
 * Mirrors the columns selected in src/app/admin/platform/page.tsx.
 */

export interface PlatformTenantRow {
  id: string;
  name: string;
  slug: string;
  subscription_plan: string | null;
  subscription_status: string | null;
  is_active: boolean;
  deleted_at: string | null;
  suspended_at: string | null;
  suspend_reason: string | null;
  custom_domain: string | null;
  created_at: string;
}

export interface PlatformUserRow {
  id: string;
  email: string;
  full_name: string | null;
  /** Transition: affiche seulement pour une ligne de plateforme (sans poste). */
  role: string;
  postes: string[];
  tenant_id: string;
  is_active: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  deleted_at: string | null;
}
