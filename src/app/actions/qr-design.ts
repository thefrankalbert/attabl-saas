'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { assertTenantServing } from '@/lib/billing/assert-tenant-serving';
import { createQrDesignService } from '@/services/qr-design.service';
import { createAuditService } from '@/services/audit.service';
import {
  saveQrDesignSchema,
  assignQrDesignSchema,
  resolveDesignsForTablesSchema,
} from '@/lib/validations/qr-design.schema';
import { getTranslations } from 'next-intl/server';
import { isFeatureEntitled } from '@/lib/plans/assert-feature';
import {
  uploadLimiter,
  assignmentLimiter,
  qrDesignResolveLimiter,
  getClientIpFromHeaders,
} from '@/lib/rate-limit';
import { ServiceError } from '@/services/errors';

/** Shared plan-entitlement check for QR customization (mirrors the trigger). */
async function assertQrCustomizationEntitled(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserWithTenant>>['supabase'],
  tenantId: string,
): Promise<boolean> {
  return isFeatureEntitled(supabase, tenantId, 'canAccessQrCustomization');
}

/**
 * QR design mutations.
 *
 * SECURITY: tenantId is derived from the authenticated session (never from the
 * client) and gated on `settings.edit`, so a member cannot persist or reassign
 * QR designs for another tenant (IDOR prevention).
 */

async function tenantSlug(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserWithTenant>>['supabase'],
  tenantId: string,
): Promise<string | null> {
  const { data } = await supabase.from('tenants').select('slug').eq('id', tenantId).single();
  return data?.slug ?? null;
}

export async function actionSaveQrDesign(input: unknown) {
  const t = await getTranslations('errors');
  try {
    const { success: allowed } = await uploadLimiter.check(getClientIpFromHeaders(await headers()));
    if (!allowed) return { success: false as const, error: t('rateLimited') };

    const { tenantId, supabase, user, postes } =
      await getAuthenticatedUserWithTenant('settings.edit');
    // Coupure du restaurant: enregistrer, supprimer ou assigner un design est une ecriture.
    await assertTenantServing(tenantId);

    const parsed = saveQrDesignSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
    }

    // Plan gate: saving a customized QR design is Pro+ (canAccessQrCustomization,
    // see pricing-data.ts). Basic QR codes stay free for all plans; only persisting
    // a custom style/template requires the paid tier. The client dims the controls,
    // but the action must enforce it so a crafted call cannot bypass the paywall.
    if (!(await assertQrCustomizationEntitled(supabase, tenantId))) {
      return { success: false as const, error: 'La personnalisation QR est reservee au plan Pro.' };
    }

    const service = createQrDesignService(supabase);
    const design = await service.saveDesign(tenantId, parsed.data);

    createAuditService(supabase, {
      tenantId,
      userId: user.id,
      userEmail: user.email,
      userRole: postes.join('+'),
    }).log({
      action: parsed.data.id ? 'update' : 'create',
      entityType: 'setting',
      entityId: design.id,
    });

    const slug = await tenantSlug(supabase, tenantId);
    if (slug) revalidatePath(`/sites/${slug}/admin/qr-codes`);

    return { success: true as const, data: design };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    logger.error('Error saving QR design', error);
    return { success: false as const, error: t('settingsUpdateError') };
  }
}

export async function actionAssignQrDesign(input: unknown) {
  const t = await getTranslations('errors');
  try {
    const { success: allowed } = await assignmentLimiter.check(
      getClientIpFromHeaders(await headers()),
    );
    if (!allowed) return { success: false as const, error: t('rateLimited') };

    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');
    // Coupure du restaurant: enregistrer, supprimer ou assigner un design est une ecriture.
    await assertTenantServing(tenantId);

    const parsed = assignQrDesignSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
    }

    // Same paywall as saving: a downgraded tenant must not keep applying paid
    // custom designs to tables/zones (SEC-03, hard enforcement per product).
    if (!(await assertQrCustomizationEntitled(supabase, tenantId))) {
      return { success: false as const, error: 'La personnalisation QR est reservee au plan Pro.' };
    }

    const service = createQrDesignService(supabase);
    if (parsed.data.target === 'zone') {
      await service.assignDesignToZone(tenantId, parsed.data.targetId, parsed.data.designId);
    } else {
      await service.assignDesignToTable(tenantId, parsed.data.targetId, parsed.data.designId);
    }

    const slug = await tenantSlug(supabase, tenantId);
    if (slug) revalidatePath(`/sites/${slug}/admin/qr-codes`);

    return { success: true as const };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    // Table ou zone introuvable: le dire, au lieu d'un succes ou d'un message generique.
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') {
      return { success: false as const, error: error.message };
    }
    logger.error('Error assigning QR design', error);
    return { success: false as const, error: t('settingsUpdateError') };
  }
}

/**
 * Resolve the effective QR design config for a set of tables (table -> zone ->
 * tenant default). Used by the batch export so each printed card reflects the
 * design assigned to its table. tenantId is derived from the session.
 */
export async function actionResolveDesignsForTables(tableIds: unknown) {
  const t = await getTranslations('errors');
  try {
    // LECTURE seule, pour imprimer les QR des tables: /qr-codes est ouvert a
    // tout membre, donc l'appartenance suffit. `settings.edit` ici empechait
    // un gerant ou la salle d'imprimer les cartes de table. Creer, modifier et
    // assigner un design restent sous `settings.edit` (actions ci-dessus).
    const { success: allowed } = await qrDesignResolveLimiter.check(
      getClientIpFromHeaders(await headers()),
    );
    if (!allowed) return { success: false as const, error: t('rateLimited') };

    const { tenantId, supabase } = await getAuthenticatedUserWithTenant();

    const parsed = resolveDesignsForTablesSchema.safeParse(tableIds);
    if (!parsed.success) {
      return { success: false as const, error: 'Invalid input' };
    }

    const data = await createQrDesignService(supabase).resolveDesignsForTables(
      tenantId,
      parsed.data,
    );
    return { success: true as const, data };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    logger.error('Error resolving QR designs', error);
    return { success: false as const, error: t('settingsUpdateError') };
  }
}
