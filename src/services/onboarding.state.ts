import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { ServiceError } from './errors';
import { pickOnboardingTenantIndex } from '@/lib/onboarding/select-onboarding-tenant';
import type { OnboardingDraft, OnboardingState } from './onboarding.types';

/**
 * Retrieves the current onboarding state for a user.
 * Merges tenant fields with the saved draft for maximum data recovery.
 */
export async function getOnboardingState(
  supabase: SupabaseClient,
  userId: string,
): Promise<OnboardingState> {
  // Lookup via service role (RLS can block admin_users during onboarding)
  const lookupClient = createAdminClient();
  const { data: adminRows } = await lookupClient
    .from('admin_users')
    .select(
      `
      tenant_id,
      tenants (
        id,
        slug,
        name,
        establishment_type,
        address,
        city,
        country,
        phone,
        table_count,
        logo_url,
        primary_color,
        secondary_color,
        description,
        currency,
        onboarding_completed,
        created_at
      )
    `,
    )
    .eq('user_id', userId)
    .eq('is_active', true);

  // Normalize the tenant join (Supabase returns it as object or array) and pick
  // deterministically: most recently created tenant whose onboarding is unfinished.
  // NEVER order by the uuid primary key - that selection is non-deterministic and
  // made multi-tenant owners resume an arbitrary establishment.
  type TenantRow = {
    id: string;
    slug: string;
    name: string;
    establishment_type: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    phone: string | null;
    table_count: number | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    description: string | null;
    currency: string | null;
    onboarding_completed: boolean | null;
    created_at: string | null;
  };
  const tenants: TenantRow[] = (adminRows ?? [])
    .map((row) => (Array.isArray(row.tenants) ? row.tenants[0] : row.tenants))
    .filter((candidate): candidate is TenantRow => !!candidate);

  if (tenants.length === 0) {
    throw new ServiceError('Tenant non trouvé', 'NOT_FOUND');
  }

  const pickIndex = pickOnboardingTenantIndex(
    tenants.map((candidate) => ({
      onboardingCompleted: !!candidate.onboarding_completed,
      createdAt: candidate.created_at,
    })),
  );
  const tenant = tenants[pickIndex];

  // Get onboarding progress INCLUDING the draft
  const { data: progress } = await supabase
    .from('onboarding_progress')
    .select('step, completed, draft')
    .eq('tenant_id', tenant.id)
    .single();

  // Base data from tenant table columns
  const baseData: OnboardingDraft = {
    establishmentType: tenant.establishment_type || 'restaurant',
    address: tenant.address || '',
    city: tenant.city || '',
    country: tenant.country || 'Tchad',
    phone: tenant.phone || '',
    tableCount: tenant.table_count || 10,
    currency: tenant.currency || 'XAF',
    tableConfigMode: 'skip',
    tableZones: [],
    logoUrl: tenant.logo_url || '',
    primaryColor: tenant.primary_color || '#CCFF00',
    secondaryColor: tenant.secondary_color || '#000000',
    description: tenant.description || '',
  };

  // Merge with draft data (draft takes priority for fields it contains)
  const draft = (progress?.draft as OnboardingDraft | null) || {};
  const mergedData: OnboardingDraft = {
    ...baseData,
    ...draft,
    // Ensure tenant table values win for fields that are written there directly,
    // unless the draft has a newer/different value
    logoUrl: draft.logoUrl ?? baseData.logoUrl,
    primaryColor: draft.primaryColor ?? baseData.primaryColor,
    secondaryColor: draft.secondaryColor ?? baseData.secondaryColor,
  };

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: draft.tenantName || tenant.name,
    // No progress row => brand-new tenant => start at the welcome screen (step 0),
    // NOT step 1 (which dropped new users straight into the establishment form and
    // felt like a session "already started"). A saved row keeps its step (>= 1).
    step: progress?.step ?? 0,
    completed: progress?.completed || false,
    data: mergedData,
  };
}
