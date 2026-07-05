import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, isTenantNameConflictError } from './errors';
import { logger } from '@/lib/logger';
import type { OnboardingStepData, OnboardingDraft } from './onboarding.types';

/**
 * Saves progress for a specific onboarding step.
 * - Writes key fields to tenants table (for immediate use by other parts of the app)
 * - Writes FULL data as JSONB draft to onboarding_progress (for restoration)
 */
export async function saveOnboardingStep(
  supabase: SupabaseClient,
  tenantId: string,
  step: number,
  data: OnboardingStepData,
  fullDraft?: OnboardingDraft,
): Promise<void> {
  const tenantUpdate: Record<string, unknown> = {};

  if (step === 1) {
    if (data.tenantName) {
      tenantUpdate.name = data.tenantName;
    }
    tenantUpdate.establishment_type = data.establishmentType;
    tenantUpdate.address = data.address;
    tenantUpdate.city = data.city;
    tenantUpdate.country = data.country;
    tenantUpdate.phone = data.phone;
    tenantUpdate.table_count = data.tableCount;
  }
  // Step 2 (tables) is stored in draft, not tenant fields
  else if (step === 3) {
    tenantUpdate.logo_url = data.logoUrl;
    tenantUpdate.primary_color = data.primaryColor;
    tenantUpdate.secondary_color = data.secondaryColor;
    tenantUpdate.description = data.description;
  }
  // Step 4 (menu) is stored in draft
  // Step 5 uses completeOnboarding()

  if (Object.keys(tenantUpdate).length > 0) {
    const { error } = await supabase.from('tenants').update(tenantUpdate).eq('id', tenantId);
    if (error) {
      if (isTenantNameConflictError(error)) {
        throw new ServiceError('RESTAURANT_NAME_TAKEN', 'CONFLICT', error);
      }
      logger.error('Failed to update tenant during onboarding save', error);
      throw new ServiceError('Failed to update tenant', 'INTERNAL');
    }
  }

  // Update or insert onboarding progress WITH full draft
  const progressData: Record<string, unknown> = {
    tenant_id: tenantId,
    step: step,
    updated_at: new Date().toISOString(),
  };

  // Store full draft if provided
  if (fullDraft) {
    progressData.draft = fullDraft;
  }

  const { error: progressError } = await supabase
    .from('onboarding_progress')
    .upsert(progressData, { onConflict: 'tenant_id' });

  if (progressError) {
    // Non-blocking: log but don't throw. The tenant update already succeeded.
    logger.error('Failed to save onboarding draft', progressError);
  }
}
