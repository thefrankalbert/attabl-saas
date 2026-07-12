import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError } from './errors';
import type { CurrencyCode, OpeningHoursMap } from '@/types/admin.types';

interface TenantSettings {
  name?: string;
  description?: string;
  primaryColor?: string;
  secondaryColor?: string;
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
  // Opening hours
  openingHours?: OpeningHoursMap;
  // Custom domain
  customDomain?: string | null;
}

/**
 * Tenant service - handles tenant lookup and settings updates.
 *
 * Extracted from tenant-settings.ts server action and orders route.
 */
export interface TenantService {
  updateSettings(tenantId: string, settings: TenantSettings): Promise<void>;
}

export function createTenantService(supabase: SupabaseClient): TenantService {
  return {
    /**
     * Updates tenant settings.
     * Maps camelCase input to snake_case database columns.
     */
    async updateSettings(tenantId: string, settings: TenantSettings): Promise<void> {
      // Validate hex color format (3- or 6-digit, matching the Zod schema).
      const hexColorRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
      if (settings.primaryColor && !hexColorRegex.test(settings.primaryColor)) {
        throw new ServiceError('Format de couleur invalide', 'VALIDATION');
      }
      if (settings.secondaryColor && !hexColorRegex.test(settings.secondaryColor)) {
        throw new ServiceError('Format de couleur invalide', 'VALIDATION');
      }

      // Partial PATCH: only columns whose value was actually provided are
      // written. A field left `undefined` (absent from the submitted form) is
      // NOT touched, so a partial save - e.g. the custom-domain quick-save that
      // only sends the domain - can never reset unrelated settings (name,
      // colors, currency, taxes, KDS...) to their defaults.
      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        ...(settings.name !== undefined && { name: settings.name }),
        ...(settings.primaryColor !== undefined && { primary_color: settings.primaryColor }),
        ...(settings.secondaryColor !== undefined && { secondary_color: settings.secondaryColor }),
        ...(settings.description !== undefined && { description: settings.description || null }),
        ...(settings.address !== undefined && { address: settings.address || null }),
        ...(settings.city !== undefined && { city: settings.city || null }),
        ...(settings.country !== undefined && { country: settings.country || null }),
        ...(settings.phone !== undefined && { phone: settings.phone || null }),
        ...(settings.logoUrl !== undefined && { logo_url: settings.logoUrl || null }),
        ...(settings.establishmentType !== undefined && {
          establishment_type: settings.establishmentType || null,
        }),
        ...(settings.tableCount !== undefined && { table_count: settings.tableCount }),
        ...(settings.notificationSoundId !== undefined && {
          notification_sound_id: settings.notificationSoundId || null,
        }),
        // Facturation fields
        ...(settings.currency !== undefined && { currency: settings.currency }),
        ...(settings.supportedCurrencies !== undefined && {
          supported_currencies: settings.supportedCurrencies,
        }),
        ...(settings.enableTax !== undefined && { enable_tax: settings.enableTax }),
        ...(settings.taxRate !== undefined && { tax_rate: settings.taxRate }),
        ...(settings.enableServiceCharge !== undefined && {
          enable_service_charge: settings.enableServiceCharge,
        }),
        ...(settings.serviceChargeRate !== undefined && {
          service_charge_rate: settings.serviceChargeRate,
        }),
        ...(settings.enableCoupons !== undefined && { enable_coupons: settings.enableCoupons }),
        // KDS
        ...(settings.barDisplayEnabled !== undefined && {
          bar_display_enabled: settings.barDisplayEnabled,
        }),
        // Idle timeout (null is a real value = disabled, only undefined is skipped)
        ...(settings.idleTimeoutMinutes !== undefined && {
          idle_timeout_minutes: settings.idleTimeoutMinutes,
        }),
        ...(settings.screenLockMode !== undefined && { screen_lock_mode: settings.screenLockMode }),
        // Opening hours
        ...(settings.openingHours !== undefined && { opening_hours: settings.openingHours }),
        // Custom domain
        ...(settings.customDomain !== undefined && {
          custom_domain: settings.customDomain || null,
        }),
      };

      const { error } = await supabase.from('tenants').update(update).eq('id', tenantId);

      if (error) {
        throw new ServiceError('Erreur lors de la mise à jour des paramètres', 'INTERNAL', error);
      }
    },
  };
}
