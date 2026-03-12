'use server';

import { revalidateTag } from 'next/cache';
import { CACHE_TAG_TENANT_CONFIG } from '@/lib/cache-tags';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { updateTenantSettingsSchema } from '@/lib/validations/tenant.schema';
import { createTenantService } from '@/services/tenant.service';
import { createAuditService } from '@/services/audit.service';
import { getTranslations } from 'next-intl/server';

/**
 * Update tenant settings.
 *
 * SECURITY: tenantId is derived from the authenticated user's session
 * to prevent unauthorized cross-tenant modifications (IDOR prevention).
 */
export async function actionUpdateTenantSettings(formData: FormData) {
  const t = await getTranslations('errors');
  try {
    // 1. Authenticate + get tenant from session (NOT from client)
    const { tenantId, supabase, user, role } = await getAuthenticatedUserWithTenant();

    // 2. Extract and validate form data with Zod
    const rawData = {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || undefined,
      primaryColor: formData.get('primaryColor') as string,
      secondaryColor: formData.get('secondaryColor') as string,
      address: (formData.get('address') as string) || undefined,
      city: (formData.get('city') as string) || undefined,
      country: (formData.get('country') as string) || undefined,
      phone: (formData.get('phone') as string) || undefined,
      logoUrl: (formData.get('logoUrl') as string) || undefined,
      notificationSoundId: (formData.get('notificationSoundId') as string) || undefined,
      establishmentType: (formData.get('establishmentType') as string) || undefined,
      tableCount: formData.get('tableCount') ? Number(formData.get('tableCount')) : undefined,
      // Billing fields
      currency: (formData.get('currency') as string) || 'XAF',
      supportedCurrencies: (() => {
        const raw = formData.get('supportedCurrencies') as string | null;
        if (!raw) return undefined;
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return undefined;
        }
      })(),
      enableTax: formData.get('enableTax') === 'true',
      taxRate: formData.get('taxRate') ? Number(formData.get('taxRate')) : 0,
      enableServiceCharge: formData.get('enableServiceCharge') === 'true',
      serviceChargeRate: formData.get('serviceChargeRate')
        ? Number(formData.get('serviceChargeRate'))
        : 0,
      // Idle timeout
      idleTimeoutMinutes: formData.get('idleTimeoutMinutes')
        ? Number(formData.get('idleTimeoutMinutes'))
        : null,
      screenLockMode: (formData.get('screenLockMode') as string) || 'overlay',
      // Custom domain
      customDomain: formData.has('customDomain')
        ? (formData.get('customDomain') as string) || null
        : undefined,
    };

    const parseResult = updateTenantSettingsSchema.safeParse(rawData);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? t('invalidData');
      return { success: false, error: firstError };
    }

    // 3. Update via service
    const tenantService = createTenantService(supabase);
    await tenantService.updateSettings(tenantId, parseResult.data);

    // Fire-and-forget audit log
    const audit = createAuditService(supabase, {
      tenantId,
      userId: user.id,
      userEmail: user.email,
      userRole: role,
    });
    audit.log({
      action: 'update',
      entityType: 'setting',
      newData: parseResult.data as Record<string, unknown>,
    });

    // 4. Revalidate cached tenant config (used by site + admin layouts)
    revalidateTag(CACHE_TAG_TENANT_CONFIG, 'max');

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: error.message };
    }

    logger.error('Error updating tenant settings', error);
    return { success: false, error: t('settingsUpdateError') };
  }
}
