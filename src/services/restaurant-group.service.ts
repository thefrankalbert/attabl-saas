import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, isTenantNameConflictError } from './errors';

interface AddRestaurantInput {
  groupId: string;
  userId: string;
  email: string;
  name: string;
  slug: string;
  type: string;
  plan: string;
}

interface AddRestaurantResult {
  tenantId: string;
  slug: string;
}

/**
 * Restaurant group service - manages owner groups and adding restaurants.
 *
 * Each owner has exactly one group. All their restaurants belong to that group.
 * The group is created automatically on first signup or first restaurant addition.
 */
export interface RestaurantGroupService {
  getOrCreateGroup(userId: string): Promise<{ id: string }>;
  addRestaurantToGroup(input: AddRestaurantInput): Promise<AddRestaurantResult>;
}

export function createRestaurantGroupService(supabase: SupabaseClient): RestaurantGroupService {
  return {
    /**
     * Get the owner's existing group, or create one if it doesn't exist.
     * Idempotent: safe to call multiple times.
     */
    async getOrCreateGroup(userId: string): Promise<{ id: string }> {
      // Try to find existing group
      const { data: existing } = await supabase
        .from('restaurant_groups')
        .select('id')
        .eq('owner_user_id', userId)
        .single();

      if (existing) {
        return { id: existing.id };
      }

      // Create new group
      const { data: created, error } = await supabase
        .from('restaurant_groups')
        .insert({ owner_user_id: userId, name: 'Mon Groupe' })
        .select('id')
        .single();

      if (error || !created) {
        throw new ServiceError(
          `Erreur création groupe: ${error?.message || 'Données manquantes'}`,
          'INTERNAL',
          error,
        );
      }

      return { id: created.id };
    },

    /**
     * Add a new restaurant to an existing group.
     *
     * Atomic: tenant + admin_users (owner) + default venue are created in a
     * single transaction by the provision_group_restaurant RPC, so a mid-flight
     * failure can never leave a tenant without an owner (no orphans).
     */
    async addRestaurantToGroup(input: AddRestaurantInput): Promise<AddRestaurantResult> {
      const { data, error } = await supabase.rpc('provision_group_restaurant', {
        p_group_id: input.groupId,
        p_user_id: input.userId,
        p_email: input.email,
        p_name: input.name,
        p_slug: input.slug,
        p_type: input.type,
        p_plan: input.plan,
      });

      if (error) {
        if (isTenantNameConflictError(error)) {
          throw new ServiceError('RESTAURANT_NAME_TAKEN', 'CONFLICT', error);
        }
        throw new ServiceError(`Erreur création restaurant: ${error.message}`, 'INTERNAL', error);
      }

      const result = data as { tenantId?: string; slug?: string } | null;
      if (!result?.tenantId || !result?.slug) {
        throw new ServiceError('Erreur création restaurant: Données manquantes', 'INTERNAL');
      }

      return { tenantId: result.tenantId, slug: result.slug };
    },
  };
}
