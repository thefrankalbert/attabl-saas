import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { CurrencyCode } from '@/types/admin.types';

interface TenantSettings {
  name: string;
  description?: string;
  primaryColor: string;
  secondaryColor: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  logoUrl?: string;
  notificationSoundId?: string;
  // Establishment
  establishmentType?: string;
  tableCount?: number;
  // Facturation fields
  currency?: CurrencyCode;
  supportedCurrencies?: CurrencyCode[];
  enableTax?: boolean;
  taxRate?: number;
  enableServiceCharge?: boolean;
  serviceChargeRate?: number;
  enableCoupons?: boolean;
  // KDS
  barDisplayEnabled?: boolean;
  // Idle timeout
  idleTimeoutMinutes?: number | null;
  screenLockMode?: 'overlay' | 'password';
  // Custom domain
  customDomain?: string | null;
}

/**
 * Tenant service - handles tenant lookup and settings updates.
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
      // Validate hex color format
      const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (settings.primaryColor && !hexColorRegex.test(settings.primaryColor)) {
        throw new ServiceError('Format de couleur invalide', 'VALIDATION');
      }
      if (settings.secondaryColor && !hexColorRegex.test(settings.secondaryColor)) {
        throw new ServiceError('Format de couleur invalide', 'VALIDATION');
      }

      const { error } = await supabase
        .from('tenants')
        .update({
          name: settings.name,
          description: settings.description ?? null,
          primary_color: settings.primaryColor,
          secondary_color: settings.secondaryColor,
          address: settings.address ?? null,
          city: settings.city ?? null,
          country: settings.country ?? null,
          phone: settings.phone ?? null,
          logo_url: settings.logoUrl || null,
          establishment_type: settings.establishmentType ?? null,
          table_count: settings.tableCount ?? null,
          notification_sound_id: settings.notificationSoundId ?? null,
          // Facturation fields
          currency: settings.currency ?? 'XAF',
          supported_currencies: settings.supportedCurrencies ?? [settings.currency ?? 'XAF'],
          enable_tax: settings.enableTax ?? false,
          tax_rate: settings.taxRate ?? 0,
          enable_service_charge: settings.enableServiceCharge ?? false,
          service_charge_rate: settings.serviceChargeRate ?? 0,
          enable_coupons: settings.enableCoupons ?? false,
          // KDS
          bar_display_enabled: settings.barDisplayEnabled ?? false,
          // Idle timeout
          idle_timeout_minutes: settings.idleTimeoutMinutes ?? null,
          screen_lock_mode: settings.screenLockMode ?? 'overlay',
          // Custom domain
          ...(settings.customDomain !== undefined && {
            custom_domain: settings.customDomain || null,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise à jour des paramètres', 'INTERNAL', error);
      }
    },
  };
}
