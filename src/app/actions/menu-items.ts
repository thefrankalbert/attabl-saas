'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { ServiceError } from '@/services/errors';
import { getTranslations } from 'next-intl/server';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';

type ActionResponse = {
  canCreate?: boolean;
  error?: string;
};

/**
 * SECURITY: Verifies user belongs to tenant before checking plan limits.
 * tenantId is verified against the session (IDOR prevention).
 */
export async function actionCheckCanAddMenuItem(tenantId: string): Promise<ActionResponse> {
  const t = await getTranslations('errors');

  try {
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager']);
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: t('notAuthenticated') };
      return { error: t('permissionDenied') };
    }
    return { error: t('permissionDenied') };
  }

  const adminClient = createAdminClient();

  try {
    const planService = createPlanEnforcementService(adminClient);

    // Récupérer le tenant avec les infos de plan
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return { error: t('tenantNotFound') };
    }

    await planService.canAddMenuItem(tenant);
    return { canCreate: true };
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    return { error: t('planLimitError') };
  }
}
