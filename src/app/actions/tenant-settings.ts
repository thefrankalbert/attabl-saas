'use server';

import { revalidateTag, revalidatePath } from 'next/cache';
import { CACHE_TAG_TENANT_CONFIG, tenantConfigTag } from '@/lib/cache-tags';
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
    const { tenantId, supabase, user, role } =
      await getAuthenticatedUserWithTenant('settings.edit');

    // 1b. Role gate: only owner/admin/manager may change tenant settings
    // (name, branding, billing rates, custom domain, ...). Without this, any
    // member (cashier/chef/waiter) could modify billing or the custom domain.
    // Mirrors the owner/admin/manager gate on the tables/zones settings actions.
    if (!['owner', 'admin', 'manager'].includes(role)) {
      return { success: false, error: t('permissionDenied') };
    }

    // 2. Extract and validate form data with Zod.
    // A field ABSENT from the FormData stays `undefined` so the service leaves
    // it untouched. This makes partial saves (e.g. the custom-domain quick-save)
    // safe: they no longer fall back to defaults that would overwrite unrelated
    // settings. Only `name` + the two colors are always sent by every save path.
    const str = (key: string) => formData.get(key) as string;
    const rawData = {
      name: formData.has('name') ? str('name') : undefined,
      primaryColor: formData.has('primaryColor') ? str('primaryColor') : undefined,
      secondaryColor: formData.has('secondaryColor') ? str('secondaryColor') : undefined,
      description: formData.has('description') ? str('description') : undefined,
      address: formData.has('address') ? str('address') : undefined,
      city: formData.has('city') ? str('city') : undefined,
      country: formData.has('country') ? str('country') : undefined,
      phone: formData.has('phone') ? str('phone') : undefined,
      logoUrl: formData.has('logoUrl') ? str('logoUrl') : undefined,
      bannerUrl: formData.has('bannerUrl') ? str('bannerUrl') : undefined,
      notificationSoundId: formData.has('notificationSoundId')
        ? str('notificationSoundId')
        : undefined,
      establishmentType: formData.has('establishmentType') ? str('establishmentType') : undefined,
      tableCount: formData.has('tableCount') ? Number(str('tableCount')) : undefined,
      // Billing fields
      currency: formData.has('currency') ? str('currency') : undefined,
      supportedCurrencies: (() => {
        const raw = formData.get('supportedCurrencies') as string | null;
        if (raw === null) return undefined;
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return undefined;
        }
      })(),
      enableTax: formData.has('enableTax') ? str('enableTax') === 'true' : undefined,
      taxRate: formData.has('taxRate') ? Number(str('taxRate')) : undefined,
      enableServiceCharge: formData.has('enableServiceCharge')
        ? str('enableServiceCharge') === 'true'
        : undefined,
      serviceChargeRate: formData.has('serviceChargeRate')
        ? Number(str('serviceChargeRate'))
        : undefined,
      enableCoupons: formData.has('enableCoupons') ? str('enableCoupons') === 'true' : undefined,
      // KDS
      barDisplayEnabled: formData.has('barDisplayEnabled')
        ? str('barDisplayEnabled') === 'true'
        : undefined,
      // Idle timeout: empty string = null (disabled), absent = untouched
      idleTimeoutMinutes: formData.has('idleTimeoutMinutes')
        ? str('idleTimeoutMinutes') === ''
          ? null
          : Number(str('idleTimeoutMinutes'))
        : undefined,
      screenLockMode: formData.has('screenLockMode') ? str('screenLockMode') : undefined,
      // Opening hours - only included when present (a partial save must not reset the map)
      openingHours: (() => {
        const raw = formData.get('openingHours') as string | null;
        if (raw === null) return undefined;
        try {
          return JSON.parse(raw) as unknown;
        } catch {
          return undefined;
        }
      })(),
      // Custom domain
      customDomain: formData.has('customDomain') ? str('customDomain') || null : undefined,
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

    // 4. Revalidate cached tenant config (scoped to this tenant)
    const { data: tenantSlug } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .single();
    if (tenantSlug?.slug) {
      revalidateTag(tenantConfigTag(tenantSlug.slug), 'max');
      revalidatePath(`/sites/${tenantSlug.slug}`);
      revalidatePath(`/sites/${tenantSlug.slug}/menu`);
    }
    // Also revalidate global tag as fallback for any non-scoped consumers
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
