import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';

interface TenantSettings {
  name: string;
  description?: string;
  primaryColor: string;
  secondaryColor: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  notificationSoundId?: string;
}

/**
 * Tenant service — handles tenant lookup and settings updates.
 *
 * Extracted from tenant-settings.ts server action and orders route.
 */
export function createTenantService(supabase: SupabaseClient) {
  return {
    /**
     * Updates tenant settings.
     * Maps camelCase input to snake_case database columns.
     */
    async updateSettings(tenantId: string, settings: TenantSettings): Promise<void> {
      const { error } = await supabase
        .from('tenants')
        .update({
          name: settings.name,
          description: settings.description ?? null,
          primary_color: settings.primaryColor,
          secondary_color: settings.secondaryColor,
          address: settings.address ?? null,
          phone: settings.phone ?? null,
          logo_url: settings.logoUrl || null,
          notification_sound_id: settings.notificationSoundId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise à jour des paramètres', 'INTERNAL', error);
      }
    },
  };
}
