'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { createSuggestionService, generateAndSaveSuggestions } from '@/services/suggestion.service';
import { ServiceError } from '@/services/errors';
import { createClient } from '@/lib/supabase/server';
import { canAccessFeature } from '@/lib/plans/features';
import type { SubscriptionPlan, SubscriptionStatus } from '@/types/billing';

type ActionResponse<T = undefined> = {
  success?: boolean;
  data?: T;
  error?: string;
};

const tenantIdSchema = z.string().uuid();
const suggestionIdSchema = z.string().uuid();

const createSuggestionPayloadSchema = z.object({
  tenant_id: z.string().uuid(),
  menu_item_id: z.string().uuid(),
  suggested_item_id: z.string().uuid(),
  suggestion_type: z.enum(['pairing', 'upsell', 'alternative']),
  description: z.string().nullable().optional(),
  display_order: z.number().int().min(0),
});

async function checkPermissions(tenantId: string): Promise<{ error: string | null }> {
  try {
    await getAuthenticatedUserForTenant(tenantId, ['owner', 'admin', 'manager'], 'menu.edit');
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? 'Non authentifie' : 'Permissions insuffisantes' };
    }
    return { error: 'Permissions insuffisantes' };
  }
}

/**
 * SECURITY: Session membership verified before creating suggestion.
 * NOTE: createSuggestion in the service does NOT filter/verify tenant_id in the write
 * query (it inserts whatever is in the data object, relying on RLS).
 * Membership is proven server-side here; tenant_id in payload is cross-checked.
 */
export async function actionCreateSuggestion(
  tenantId: string,
  payload: z.infer<typeof createSuggestionPayloadSchema>,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) return { error: 'Invalid tenant ID' };

  const parsedPayload = createSuggestionPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) return { error: 'Invalid input' };

  if (parsedPayload.data.tenant_id !== tenantId) return { error: 'Tenant mismatch' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const suggestionService = createSuggestionService(supabase);
    await suggestionService.createSuggestion(parsedPayload.data);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before deactivating suggestion.
 * deactivateSuggestion also filters by tenant_id (belt-and-suspenders).
 */
export async function actionDeactivateSuggestion(
  tenantId: string,
  suggestionId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedId = suggestionIdSchema.safeParse(suggestionId);
  if (!parsedTenant.success || !parsedId.success) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const suggestionService = createSuggestionService(supabase);
    await suggestionService.deactivateSuggestion(suggestionId, tenantId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before bulk-deactivating suggestions.
 * bulkDeactivateSuggestions also filters by tenant_id (belt-and-suspenders).
 */
export async function actionBulkDeactivateSuggestions(
  tenantId: string,
  suggestionIds: string[],
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) return { error: 'Invalid tenant ID' };

  const parsedIds = z.array(z.string().uuid()).safeParse(suggestionIds);
  if (!parsedIds.success || parsedIds.data.length === 0) return { error: 'Invalid input' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const suggestionService = createSuggestionService(supabase);
    await suggestionService.bulkDeactivateSuggestions(parsedIds.data, tenantId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before auto-generating suggestions.
 * generateAndSaveSuggestions filters by tenant_id in all queries.
 */
export async function actionGenerateAndSaveSuggestions(
  tenantId: string,
): Promise<ActionResponse<number>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) return { error: 'Invalid tenant ID' };

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();

    // Plan gate: AI auto-generation of suggestions is Business+ (canAccessAIAnalytics,
    // pricing "advancedReports"). The client hides the button, but the action must
    // enforce it too so a crafted call cannot bypass the paywall.
    const { data: tenant } = await supabase
      .from('tenants')
      .select('subscription_plan, subscription_status, trial_ends_at')
      .eq('id', tenantId)
      .maybeSingle();

    if (
      !canAccessFeature(
        'canAccessAIAnalytics',
        tenant?.subscription_plan as SubscriptionPlan | null,
        tenant?.subscription_status as SubscriptionStatus | null,
        tenant?.trial_ends_at ?? null,
      )
    ) {
      return { error: 'Fonctionnalite reservee au plan Business' };
    }

    const count = await generateAndSaveSuggestions(supabase, tenantId);
    return { success: true, data: count };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Server error' };
  }
}
