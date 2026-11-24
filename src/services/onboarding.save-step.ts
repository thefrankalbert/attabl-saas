import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceError, isTenantNameConflictError } from './errors';
import { logger } from '@/lib/logger';
import type { OnboardingStepData, OnboardingDraft } from './onboarding.types';
import { onboardingStep1Schema, onboardingStep3Schema } from '@/lib/validations/onboarding.schema';
import type { z } from 'zod';

/**
 * B10/B59: une etape n'ecrit dans `tenants` que des valeurs validees par son
 * schema (couleur hexa, logo de l'application, longueurs bornees). Une valeur
 * illisible est refusee, jamais enregistree.
 */
function validateStep<T>(schema: z.ZodType<T>, data: OnboardingStepData): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ServiceError(parsed.error.issues[0]?.message ?? 'Donnees invalides', 'VALIDATION');
  }
  return parsed.data;
}

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
    const valid = validateStep(onboardingStep1Schema, data);
    if (valid.tenantName) {
      tenantUpdate.name = valid.tenantName;
    }
    tenantUpdate.establishment_type = valid.establishmentType;
    tenantUpdate.address = valid.address;
    tenantUpdate.city = valid.city;
    tenantUpdate.country = valid.country;
    tenantUpdate.phone = valid.phone;
    tenantUpdate.table_count = valid.tableCount;
  }
  // Step 2 (tables) is stored in draft, not tenant fields
  else if (step === 3) {
    const valid = validateStep(onboardingStep3Schema, data);
    tenantUpdate.logo_url = valid.logoUrl;
    tenantUpdate.primary_color = valid.primaryColor;
    tenantUpdate.secondary_color = valid.secondaryColor;
    tenantUpdate.description = valid.description;
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
    // The draft IS the resume point: everything the user typed that has no
    // tenant column (menu, tables, QR, details) lives only here. Swallowing
    // this error made the screen show "saved" while nothing was kept, and the
    // user found an empty form after logging back in.
    logger.error('Failed to save onboarding draft', progressError, { tenantId });
    throw new ServiceError('Failed to save onboarding draft', 'INTERNAL', progressError);
  }
}
