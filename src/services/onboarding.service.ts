import type { SupabaseClient } from '@supabase/supabase-js';
import { saveOnboardingStep } from './onboarding.save-step';
import { completeOnboarding as runCompleteOnboarding } from './onboarding.complete';
import { getOnboardingState } from './onboarding.state';
import type {
  OnboardingCompleteData,
  OnboardingDraft,
  OnboardingService,
  OnboardingState,
  OnboardingStepData,
} from './onboarding.types';

export type {
  TableZoneData,
  MenuItem,
  OnboardingStepData,
  OnboardingCompleteData,
  OnboardingDraft,
  OnboardingState,
  OnboardingService,
} from './onboarding.types';

/**
 * Onboarding service - handles the multi-step onboarding flow.
 *
 * Data is persisted in two places:
 * 1. `tenants` table - key business fields (establishment_type, logo_url, etc.)
 * 2. `onboarding_progress.draft` (JSONB) - FULL onboarding state including all fields
 *    that don't have dedicated tenant columns (menu items, QR config, language, etc.)
 *
 * On restore, draft takes priority since it has the most complete snapshot.
 */
export function createOnboardingService(supabase: SupabaseClient): OnboardingService {
  return {
    saveStep(
      tenantId: string,
      step: number,
      data: OnboardingStepData,
      fullDraft?: OnboardingDraft,
    ): Promise<void> {
      return saveOnboardingStep(supabase, tenantId, step, data, fullDraft);
    },

    completeOnboarding(tenantId: string, data: OnboardingCompleteData): Promise<{ slug?: string }> {
      return runCompleteOnboarding(supabase, tenantId, data);
    },

    getState(userId: string): Promise<OnboardingState> {
      return getOnboardingState(supabase, userId);
    },
  };
}
