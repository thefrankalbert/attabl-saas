import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, isTenantNameConflictError } from './errors';
import type { Tenant } from '@/types/admin.types';
import { createPlanEnforcementService } from './plan-enforcement.service';
import { createTableConfigGuards } from './table-config.guards';
import { createSlugService } from './slug.service';

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
  createVenue(tenant: Tenant, name: string): Promise<{ id: string; name: string; slug: string }>;
  renameVenue(tenantId: string, venueId: string, name: string): Promise<void>;
  deactivateVenue(tenantId: string, venueId: string): Promise<void>;
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

    /**
     * Cree un espace (venue) pour le tenant.
     * - canAddVenue applique la limite de plan (paywall applicatif).
     * - slug genere unique DANS le tenant (la colonne slug est NOT NULL ;
     *   generateUniqueSlug du slug.service vise `tenants`, pas `venues`, donc on
     *   fait l unicite nous-memes ici).
     */
    async createVenue(
      tenant: Tenant,
      name: string,
    ): Promise<{ id: string; name: string; slug: string }> {
      await createPlanEnforcementService(supabase).canAddVenue(tenant);

      const base = createSlugService(supabase).normalizeToSlug(name) || 'espace';

      // Unicite scope-tenant : lire les slugs existants du tenant qui partagent la base.
      const { data: existing, error: slugErr } = await supabase
        .from('venues')
        .select('slug')
        .eq('tenant_id', tenant.id)
        .like('slug', `${base}%`);

      if (slugErr) {
        throw new ServiceError('Erreur verification espace', 'INTERNAL', slugErr);
      }

      const taken = new Set((existing ?? []).map((v) => v.slug as string));
      let slug = base;
      for (let i = 2; taken.has(slug); i++) {
        slug = `${base}-${i}`;
      }

      const { data: created, error } = await supabase
        .from('venues')
        .insert([{ tenant_id: tenant.id, name, slug, is_active: true }])
        .select('id, name, slug')
        .single();

      if (error || !created) {
        throw new ServiceError('Erreur creation espace', 'INTERNAL', error);
      }

      return {
        id: created.id as string,
        name: created.name as string,
        slug: created.slug as string,
      };
    },

    /**
     * Renomme un espace. Le slug reste inchange (ne pas casser d eventuels liens).
     */
    async renameVenue(tenantId: string, venueId: string, name: string): Promise<void> {
      await createTableConfigGuards(supabase).assertVenueOwnedByTenant(tenantId, venueId);

      const { error } = await supabase
        .from('venues')
        .update({ name })
        .eq('id', venueId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur renommage espace', 'INTERNAL', error);
      }
    },

    /**
     * Desactive un espace. Refuse si c est le dernier espace actif du tenant
     * (un tenant doit toujours garder au moins un espace).
     */
    async deactivateVenue(tenantId: string, venueId: string): Promise<void> {
      await createTableConfigGuards(supabase).assertVenueOwnedByTenant(tenantId, venueId);

      const { count, error: countErr } = await supabase
        .from('venues')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true);

      if (countErr) {
        throw new ServiceError('Erreur verification espace', 'INTERNAL', countErr);
      }

      if ((count ?? 0) < 2) {
        throw new ServiceError('Impossible de desactiver le dernier espace', 'VALIDATION');
      }

      const { error } = await supabase
        .from('venues')
        .update({ is_active: false })
        .eq('id', venueId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new ServiceError('Erreur desactivation espace', 'INTERNAL', error);
      }
    },
  };
}
