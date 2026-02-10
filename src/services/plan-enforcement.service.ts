import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlanLimits } from '@/lib/plans/features';
import type { Tenant } from '@/types/admin.types';
import { ServiceError } from './errors';

/**
 * Plan Enforcement Service — server-side limit checking.
 *
 * This service ENFORCES plan limits (not just displays them).
 * Every resource creation must check limits before proceeding.
 */
export function createPlanEnforcementService(supabase: SupabaseClient) {
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
          `Limite atteinte : ${limits.maxAdmins} administrateur(s) maximum pour votre plan ${tenant.subscription_plan || 'essentiel'}. Passez au plan supérieur pour en ajouter plus.`,
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

      const { count, error } = await supabase
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

      if (error) {
        throw new ServiceError('Erreur de vérification des limites', 'INTERNAL', error);
      }

      if ((count || 0) >= limits.maxItems) {
        throw new ServiceError(
          `Limite atteinte : ${limits.maxItems} articles maximum pour votre plan ${tenant.subscription_plan || 'essentiel'}. Passez au plan supérieur pour en ajouter plus.`,
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
          `Limite atteinte : ${limits.maxVenues} établissement(s) maximum pour votre plan ${tenant.subscription_plan || 'essentiel'}. Passez au plan supérieur pour en ajouter plus.`,
          'VALIDATION',
        );
      }
    },

    /**
     * Get current usage counts for a tenant (for display)
     */
    async getUsageCounts(tenantId: string): Promise<{
      admins: number;
      items: number;
      venues: number;
    }> {
      const [adminsRes, itemsRes, venuesRes] = await Promise.all([
        supabase
          .from('admin_users')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
        supabase
          .from('menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId),
        supabase
          .from('venues')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true),
      ]);

      return {
        admins: adminsRes.count || 0,
        items: itemsRes.count || 0,
        venues: venuesRes.count || 0,
      };
    },
  };
}
