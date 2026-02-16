import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { CurrencyCode } from '@/types/admin.types';

interface TenantSettings {
  name: string;
  description?: string;
  primaryColor: string;
  secondaryColor: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  notificationSoundId?: string;
  // Facturation fields
  currency?: CurrencyCode;
  enableTax?: boolean;
  taxRate?: number;
  enableServiceCharge?: boolean;
  serviceChargeRate?: number;
  // Idle timeout
  idleTimeoutMinutes?: number | null;
  screenLockMode?: 'overlay' | 'password';
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
          // Facturation fields
          currency: settings.currency ?? 'XAF',
          enable_tax: settings.enableTax ?? false,
          tax_rate: settings.taxRate ?? 0,
          enable_service_charge: settings.enableServiceCharge ?? false,
          service_charge_rate: settings.serviceChargeRate ?? 0,
          // Idle timeout
          idle_timeout_minutes: settings.idleTimeoutMinutes ?? null,
          screen_lock_mode: settings.screenLockMode ?? 'overlay',
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise à jour des paramètres', 'INTERNAL', error);
      }
    },
  };
}
