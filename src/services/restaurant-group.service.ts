import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

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
 * Restaurant group service — manages owner groups and adding restaurants.
 *
 * Each owner has exactly one group. All their restaurants belong to that group.
 * The group is created automatically on first signup or first restaurant addition.
 */
export function createRestaurantGroupService(supabase: SupabaseClient) {
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
     * Steps:
     * 1. Create tenant with group_id and trial period
     * 2. Create admin_users entry (role: owner)
     * 3. Create default venue (best-effort)
     */
    async addRestaurantToGroup(input: AddRestaurantInput): Promise<AddRestaurantResult> {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      // 1. Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          slug: input.slug,
          name: input.name,
          group_id: input.groupId,
          subscription_plan: input.plan === 'trial' ? 'essentiel' : input.plan,
          subscription_status: input.plan === 'trial' ? 'trial' : 'pending',
          trial_ends_at: input.plan === 'trial' ? trialEndsAt.toISOString() : null,
          is_active: true,
        })
        .select('id, slug')
        .single();

      if (tenantError || !tenant) {
        throw new ServiceError(
          `Erreur création restaurant: ${tenantError?.message || 'Données manquantes'}`,
          'INTERNAL',
          tenantError,
        );
      }

      // 2. Create admin_users entry (rollback tenant on failure)
      const { error: adminError } = await supabase.from('admin_users').insert({
        tenant_id: tenant.id,
        user_id: input.userId,
        email: input.email,
        full_name: input.name,
        role: 'owner',
        is_active: true,
      });

      if (adminError) {
        await supabase.from('tenants').delete().eq('id', tenant.id);
        throw new ServiceError(
          `Erreur création admin: ${adminError.message}`,
          'INTERNAL',
          adminError,
        );
      }

      // 3. Create default venue (best-effort, no rollback)
      await supabase.from('venues').insert({
        tenant_id: tenant.id,
        slug: 'main',
        name: 'Salle principale',
        name_en: 'Main Dining',
        type: input.type,
        is_active: true,
      });

      return { tenantId: tenant.id, slug: tenant.slug };
    },
  };
}
