import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { ServiceError } from './errors';
import { ONBOARDING_LAUNCH_DEFAULTS } from '@/lib/onboarding/launch-defaults';
import { parseEstablishmentDetails } from '@/lib/validations/establishment-details.schema';
import type { OnboardingDraft, OnboardingState } from './onboarding.types';

/**
 * Retrieves the onboarding state of ONE tenant.
 *
 * The tenant is chosen by the caller (`resolveSessionAdminUser`, scoped to the
 * session user). This function used to re-pick the tenant on its own from the
 * user id: two copies of the same choice that could disagree, so the screen
 * could show restaurant B while the saves went to restaurant C.
 *
 * Merges tenant columns with the saved draft (draft wins: it is the complete
 * snapshot of what the user typed).
 */
export async function getOnboardingState(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<OnboardingState> {
  // Service role for the tenant row: RLS can block the read during onboarding.
  // Safe because tenantId comes from the session membership, never the client.
  const lookupClient = createAdminClient();
  const { data: tenant, error: tenantError } = await lookupClient
    .from('tenants')
    .select(
      'id, slug, name, establishment_type, address, city, country, phone, table_count, logo_url, primary_color, secondary_color, description, currency, default_locale, establishment_details, onboarding_completed',
    )
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError) {
    throw new ServiceError('Lecture du restaurant impossible', 'INTERNAL', tenantError);
  }
  if (!tenant) {
    throw new ServiceError('Tenant non trouvé', 'NOT_FOUND');
  }

  const { data: progress, error: progressError } = await supabase
    .from('onboarding_progress')
    .select('step, completed, draft')
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  // A failed read must not look like "no progress": that would send the user
  // back to the welcome screen with empty fields, and the next auto-save would
  // overwrite the real draft with them.
  if (progressError) {
    throw new ServiceError('Lecture de la progression impossible', 'INTERNAL', progressError);
  }

  const completed = !!tenant.onboarding_completed;

  // Before the onboarding is finished, `currency` and `country` still hold the
  // DATABASE defaults (XAF / Cameroun), not a choice of the user: anything the
  // user typed lives in the draft. Proposing them would preselect the wrong
  // currency for the launch market, so the launch defaults are used instead.
  // Once finished, the columns ARE the user's choice and are returned as is.
  const details = parseEstablishmentDetails(tenant.establishment_details);
  const baseData: OnboardingDraft = {
    establishmentType: tenant.establishment_type || 'restaurant',
    address: tenant.address || '',
    city: tenant.city || '',
    country: completed
      ? tenant.country || ONBOARDING_LAUNCH_DEFAULTS.country
      : ONBOARDING_LAUNCH_DEFAULTS.country,
    phone: tenant.phone || '',
    tableCount: tenant.table_count || 10,
    currency: completed
      ? tenant.currency || ONBOARDING_LAUNCH_DEFAULTS.currency
      : ONBOARDING_LAUNCH_DEFAULTS.currency,
    ...(tenant.default_locale ? { language: tenant.default_locale } : {}),
    ...details,
    tableConfigMode: 'skip',
    tableZones: [],
    logoUrl: tenant.logo_url || '',
    primaryColor: tenant.primary_color || '#CCFF00',
    secondaryColor: tenant.secondary_color || '#000000',
    description: tenant.description || '',
  };

  // Draft takes priority for every field it contains.
  const draft = (progress?.draft as OnboardingDraft | null) || {};
  const mergedData: OnboardingDraft = { ...baseData, ...draft };

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: draft.tenantName || tenant.name,
    // No progress row => brand-new tenant => start at the welcome screen (step 0).
    step: progress?.step ?? 0,
    // The tenant flag alone, like the save/complete routes and the admin
    // layout: two sources could disagree and bounce the user between the
    // onboarding and the "resume" dialog.
    completed,
    data: mergedData,
  };
}
