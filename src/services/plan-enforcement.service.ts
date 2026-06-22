import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlanLimits } from '@/lib/plans/features';
import type { Tenant } from '@/types/admin.types';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';
import { ServiceError } from './errors';

/**
 * Roles counted against the per-plan staff limit (maxStaff).
 * Admin/owner roles are counted against maxAdmins instead.
 */
export const STAFF_ROLES = ['manager', 'cashier', 'chef', 'waiter'] as const;

/**
 * Plan Enforcement Service - server-side limit checking.
 *
 * This service ENFORCES plan limits (not just displays them).
 * Every resource creation must check limits before proceeding.
 */
export interface PlanEnforcementService {
  canAddAdmin(tenant: Tenant): Promise<void>;
  canAddStaff(tenant: Tenant): Promise<void>;
  getMonthlyOrderUsage(
    tenant: {
      id: string;
      subscription_plan?: string | null;
      subscription_status?: string | null;
      trial_ends_at?: string | null;
    },
    monthStart: Date,
  ): Promise<{ count: number; limit: number; exceeded: boolean }>;
  canAddMenuItem(tenant: Tenant): Promise<void>;
  canAddVenue(tenant: Tenant): Promise<void>;
  canAddMenu(tenant: Tenant): Promise<void>;
  canAddItems(tenant: Tenant, batchSize: number): Promise<void>;
  getUsageCounts(tenantId: string): Promise<{
    admins: number;
    items: number;
    venues: number;
    menus: number;
    categories: number;
  }>;
}

export function createPlanEnforcementService(supabase: SupabaseClient): PlanEnforcementService {
  return {
    /**
     * Check if tenant can add more admin users
     */
    async canAddAdmin(tenant: Tenant): Promise<void> {
      const limits = getPlanLimits(
        tenant.subscription_plan,
        tenant.subscription_status,
        tenant.trial_ends_at,
      );

      if (limits.maxAdmins === -1) return;

      const { count, error } = await supabase
        .from('admin_users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      if (error) {
        throw new ServiceError('Erreur de vérification des limites', 'INTERNAL', error);
      }

      if ((count || 0) >= limits.maxAdmins) {
        throw new ServiceError(
          `Limite atteinte : ${limits.maxAdmins} administrateur(s) maximum pour votre plan ${tenant.subscription_plan || 'starter'}. Passez au plan supérieur pour en ajouter plus.`,
          'VALIDATION',
        );
      }
    },

    /**
     * Check if tenant can add more staff members (manager, cashier, chef, waiter)
     */
    async canAddStaff(tenant: Tenant): Promise<void> {
      const limits = getPlanLimits(
        tenant.subscription_plan,
        tenant.subscription_status,
        tenant.trial_ends_at,
      );

      if (limits.maxStaff === -1) return;

      const { count, error } = await supabase
        .from('admin_users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .in('role', [...STAFF_ROLES]);

      if (error) {
        throw new ServiceError('Erreur de vérification des limites', 'INTERNAL', error);
      }

      if ((count || 0) >= limits.maxStaff) {
        throw new ServiceError(
          `Limite atteinte : ${limits.maxStaff} membre(s) d'equipe maximum pour votre plan ${tenant.subscription_plan || 'starter'}. Passez au plan superieur pour en ajouter plus.`,
          'VALIDATION',
        );
      }
    },

    /**
     * Check if tenant can add more menu items
     */
    async canAddMenuItem(tenant: Tenant): Promise<void> {
      const limits = getPlanLimits(
        tenant.subscription_plan,
        tenant.subscription_status,
        tenant.trial_ends_at,
      );

      if (limits.maxItems === -1) return;

      const { count, error } = await supabase
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .is('deleted_at', null);

      if (error) {
        throw new ServiceError('Erreur de vérification des limites', 'INTERNAL', error);
      }

      if ((count || 0) >= limits.maxItems) {
        throw new ServiceError(
          `Limite atteinte : ${limits.maxItems} articles maximum pour votre plan ${tenant.subscription_plan || 'starter'}. Passez au plan supérieur pour en ajouter plus.`,
          'VALIDATION',
        );
      }
    },

    /**
     * Check if tenant can add more venues
     */
    async canAddVenue(tenant: Tenant): Promise<void> {
      const limits = getPlanLimits(
        tenant.subscription_plan,
        tenant.subscription_status,
        tenant.trial_ends_at,
      );

      if (limits.maxVenues === -1) return;

      const { count, error } = await supabase
        .from('venues')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      if (error) {
        throw new ServiceError('Erreur de vérification des limites', 'INTERNAL', error);
      }

      if ((count || 0) >= limits.maxVenues) {
        throw new ServiceError(
          `Limite atteinte : ${limits.maxVenues} établissement(s) maximum pour votre plan ${tenant.subscription_plan || 'starter'}. Passez au plan supérieur pour en ajouter plus.`,
          'VALIDATION',
        );
      }
    },

    /**
     * Check if tenant can add more menus (cartes)
     */
    async canAddMenu(tenant: Tenant): Promise<void> {
      const limits = getPlanLimits(
        tenant.subscription_plan,
        tenant.subscription_status,
        tenant.trial_ends_at,
      );

      if (limits.maxMenus === -1) return;

      const { count, error } = await supabase
        .from('menus')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      if (error) {
        throw new ServiceError('Erreur de vérification des limites', 'INTERNAL', error);
      }

      if ((count || 0) >= limits.maxMenus) {
        throw new ServiceError(
          `Limite atteinte : ${limits.maxMenus} carte(s) maximum pour votre plan ${tenant.subscription_plan || 'starter'}. Passez au plan supérieur pour en ajouter plus.`,
          'VALIDATION',
        );
      }
    },

    /**
     * Check if tenant can add a batch of items (for bulk imports)
     */
    async canAddItems(tenant: Tenant, batchSize: number): Promise<void> {
      const limits = getPlanLimits(
        tenant.subscription_plan,
        tenant.subscription_status,
        tenant.trial_ends_at,
      );

      if (limits.maxItems === -1) return;

      const { count, error } = await supabase
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .is('deleted_at', null);

      if (error) {
        throw new ServiceError('Erreur de verification des limites', 'INTERNAL', error);
      }

      if ((count || 0) + batchSize > limits.maxItems) {
        const remaining = limits.maxItems - (count || 0);
        throw new ServiceError(
          `Limite atteinte : ${limits.maxItems} articles maximum pour votre plan ${tenant.subscription_plan || 'starter'}. Il vous reste ${Math.max(0, remaining)} emplacement(s) disponible(s).`,
          'VALIDATION',
        );
      }
    },

    /**
     * Monthly order usage for a tenant. Read-only (non-blocking): used to warn
     * when the per-plan monthly order quota is exceeded, never to reject orders.
     * Uses a direct uncached count so it reflects the live total.
     * limit === -1 means unlimited (never exceeded).
     */
    async getMonthlyOrderUsage(
      tenant: {
        id: string;
        subscription_plan?: string | null;
        subscription_status?: string | null;
        trial_ends_at?: string | null;
      },
      monthStart: Date,
    ): Promise<{ count: number; limit: number; exceeded: boolean }> {
      const limits = getPlanLimits(
        tenant.subscription_plan as SubscriptionPlan | null,
        tenant.subscription_status as SubscriptionStatus | null,
        tenant.trial_ends_at,
      );

      if (limits.maxMonthlyOrders === -1) {
        return { count: 0, limit: -1, exceeded: false };
      }

      const { count, error } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('created_at', monthStart.toISOString());

      if (error) {
        throw new ServiceError('Erreur de verification des limites', 'INTERNAL', error);
      }

      const total = count || 0;
      return {
        count: total,
        limit: limits.maxMonthlyOrders,
        exceeded: total >= limits.maxMonthlyOrders,
      };
    },

    /**
     * Get current usage counts for a tenant (for display)
     */
    async getUsageCounts(tenantId: string): Promise<{
      admins: number;
      items: number;
      venues: number;
      menus: number;
      categories: number;
    }> {
      const [adminsRes, itemsRes, venuesRes, menusRes, categoriesRes] = await Promise.all([
        supabase
          .from('admin_users')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        supabase
          .from('menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .is('deleted_at', null),
        supabase
          .from('venues')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        supabase
          .from('menus')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        supabase
          .from('categories')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
      ]);

      return {
        admins: adminsRes.count || 0,
        items: itemsRes.count || 0,
        venues: venuesRes.count || 0,
        menus: menusRes.count || 0,
        categories: categoriesRes.count || 0,
      };
    },
  };
}
