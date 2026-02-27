'use server';

import { revalidateTag } from 'next/cache';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { updateTenantSettingsSchema } from '@/lib/validations/tenant.schema';
import { createTenantService } from '@/services/tenant.service';
import { createAuditService } from '@/services/audit.service';

/**
 * Update tenant settings.
 *
 * SECURITY: tenantId is derived from the authenticated user's session
 * to prevent unauthorized cross-tenant modifications (IDOR prevention).
 */
export async function updateTenantSettings(formData: FormData) {
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
      phone: (formData.get('phone') as string) || undefined,
      logoUrl: (formData.get('logoUrl') as string) || undefined,
      notificationSoundId: (formData.get('notificationSoundId') as string) || undefined,
      // Billing fields
      currency: (formData.get('currency') as string) || 'XAF',
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
      const firstError = parseResult.error.issues[0]?.message ?? 'Données invalides';
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
    revalidateTag('tenant-config', { expire: 0 });

    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: error.message };
    }

    logger.error('Error updating tenant settings', error);
    return { success: false, error: 'Une erreur est survenue lors de la mise à jour.' };
  }
}
