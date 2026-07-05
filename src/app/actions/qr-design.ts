'use server';

import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserWithTenant, AuthError } from '@/lib/auth/get-session';
import { createQrDesignService } from '@/services/qr-design.service';
import { createAuditService } from '@/services/audit.service';
import { saveQrDesignSchema, assignQrDesignSchema } from '@/lib/validations/qr-design.schema';
import { getTranslations } from 'next-intl/server';

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
    const { tenantId, supabase, user, role } =
      await getAuthenticatedUserWithTenant('settings.edit');

    const parsed = saveQrDesignSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
    }

    const service = createQrDesignService(supabase);
    const design = await service.saveDesign(tenantId, parsed.data);

    createAuditService(supabase, {
      tenantId,
      userId: user.id,
      userEmail: user.email,
      userRole: role,
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

export async function actionDeleteQrDesign(id: unknown) {
  const t = await getTranslations('errors');
  try {
    const { tenantId, supabase, user, role } =
      await getAuthenticatedUserWithTenant('settings.edit');

    if (typeof id !== 'string' || id.length === 0) {
      return { success: false as const, error: 'Invalid input' };
    }

    const service = createQrDesignService(supabase);
    await service.deleteDesign(tenantId, id);

    createAuditService(supabase, {
      tenantId,
      userId: user.id,
      userEmail: user.email,
      userRole: role,
    }).log({ action: 'delete', entityType: 'setting', entityId: id });

    const slug = await tenantSlug(supabase, tenantId);
    if (slug) revalidatePath(`/sites/${slug}/admin/qr-codes`);

    return { success: true as const };
  } catch (error) {
    if (error instanceof AuthError) return { success: false as const, error: error.message };
    logger.error('Error deleting QR design', error);
    return { success: false as const, error: t('settingsUpdateError') };
  }
}

export async function actionAssignQrDesign(input: unknown) {
  const t = await getTranslations('errors');
  try {
    const { tenantId, supabase } = await getAuthenticatedUserWithTenant('settings.edit');

    const parsed = assignQrDesignSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
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
    logger.error('Error assigning QR design', error);
    return { success: false as const, error: t('settingsUpdateError') };
  }
}
