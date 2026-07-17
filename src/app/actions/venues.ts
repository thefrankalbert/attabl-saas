'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { createRestaurantGroupService } from '@/services/restaurant-group.service';
import { ServiceError } from '@/services/errors';
import { restaurantCreateLimiter, getClientIpFromHeaders } from '@/lib/rate-limit';
import {
  createVenueSchema,
  renameVenueSchema,
  deactivateVenueSchema,
} from '@/lib/validations/venue.schema';
import type { Tenant } from '@/types/admin.types';

/**
 * Espaces de restauration (table `venues`) - mutations admin.
 *
 * SECURITY : tenantId derive de la session (jamais du client), gate `settings.edit`.
 * createVenue applique le paywall de plan (canAddVenue) ; rename/deactivate passent
 * par la garde de propriete (assertVenueOwnedByTenant, dans le service).
 */

async function revalidateEspaces(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserWithTenant>>['supabase'],
  tenantId: string,
): Promise<void> {
  const { data } = await supabase.from('tenants').select('slug').eq('id', tenantId).maybeSingle();
  if (data?.slug) revalidatePath(`/sites/${data.slug}/admin/settings/espaces`);
}

export async function actionCreateVenue(input: unknown) {
  try {
    const { success: allowed } = await restaurantCreateLimiter.check(
      getClientIpFromHeaders(await headers()),
    );
    if (!allowed) {
      return { success: false as const, error: 'Trop de tentatives. Reessayez dans un instant.' };
    }

    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');

    const parsed = createVenueSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Nom invalide.' };
    }

    // canAddVenue a besoin du plan effectif du tenant : charger les champs plan.
    const { data: t } = await supabase
      .from('tenants')
      .select('subscription_plan, subscription_status, trial_ends_at')
      .eq('id', tenantId)
      .maybeSingle();

    const tenant = {
      id: tenantId,
      subscription_plan: t?.subscription_plan ?? null,
      subscription_status: t?.subscription_status ?? null,
      trial_ends_at: t?.trial_ends_at ?? null,
    } as Tenant;

    const service = createRestaurantGroupService(supabase);
    const data = await service.createVenue(tenant, parsed.data.name);

    await revalidateEspaces(supabase, tenantId);
    return { success: true as const, data };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    if (error instanceof ServiceError) return { success: false as const, error: error.message };
    logger.error('Error creating venue', error);
    return { success: false as const, error: 'Impossible de creer l espace.' };
  }
}

export async function actionRenameVenue(input: unknown) {
  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');

    const parsed = renameVenueSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues[0]?.message ?? 'Entree invalide.',
      };
    }

    const service = createRestaurantGroupService(supabase);
    await service.renameVenue(tenantId, parsed.data.id, parsed.data.name);

    await revalidateEspaces(supabase, tenantId);
    return { success: true as const };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    if (error instanceof ServiceError) return { success: false as const, error: error.message };
    logger.error('Error renaming venue', error);
    return { success: false as const, error: 'Impossible de renommer l espace.' };
  }
}

export async function actionDeactivateVenue(input: unknown) {
  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');

    const parsed = deactivateVenueSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false as const,
        error: parsed.error.issues[0]?.message ?? 'Entree invalide.',
      };
    }

    const service = createRestaurantGroupService(supabase);
    await service.deactivateVenue(tenantId, parsed.data.id);

    await revalidateEspaces(supabase, tenantId);
    return { success: true as const };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    if (error instanceof ServiceError) return { success: false as const, error: error.message };
    logger.error('Error deactivating venue', error);
    return { success: false as const, error: 'Impossible de desactiver l espace.' };
  }
}
