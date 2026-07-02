'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { AuthError } from '@/lib/auth/get-session';
import { ServiceError } from '@/services/errors';
import { createPlatformAdminService } from '@/services/platform-admin.service';
import { tenantActionSchema, adminUserActionSchema } from '@/lib/validations/platform-admin.schema';
import { CACHE_TAG_TENANT_CONFIG, CACHE_TAG_TENANT_DOMAIN } from '@/lib/cache-tags';
import { logger } from '@/lib/logger';

type ActionResponse = { success?: boolean; error?: string };
type ImpersonateResponse = ActionResponse & { slug?: string };

/**
 * Super-admin (god-mode) Command Center actions.
 *
 * Every action: requireSuperAdmin() -> Zod validation -> service_role mutation
 * via the platform service (which writes platform_audit_log) -> cache bust.
 * tenant ids/user ids come from the client but the actor is always the
 * server-verified super-admin, and the service uses the service_role client by
 * design (platform-level, spans tenants).
 */

function toMessage(err: unknown, fallback: string): string {
  if (err instanceof AuthError) return err.message;
  if (err instanceof ServiceError) return err.message;
  logger.error('platform-admin action failed', err);
  return fallback;
}

/** Bust every tenant-config cache so convive/admin reflect the change at once. */
function bustTenantCaches() {
  revalidateTag(CACHE_TAG_TENANT_CONFIG, 'max');
  revalidateTag(CACHE_TAG_TENANT_DOMAIN, 'max');
  revalidatePath('/admin/tenants');
}

export async function actionSuspendTenant(
  tenantId: string,
  reason?: string,
): Promise<ActionResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = tenantActionSchema.safeParse({ tenantId, reason });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const service = createPlatformAdminService(createAdminClient());
    await service.suspendTenant(
      parsed.data.tenantId,
      { userId: user.id, email: user.email },
      parsed.data.reason,
    );
    bustTenantCaches();
    return { success: true };
  } catch (err) {
    return { error: toMessage(err, 'Echec de la suspension') };
  }
}

export async function actionUnsuspendTenant(tenantId: string): Promise<ActionResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = tenantActionSchema.safeParse({ tenantId });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const service = createPlatformAdminService(createAdminClient());
    await service.unsuspendTenant(parsed.data.tenantId, { userId: user.id, email: user.email });
    bustTenantCaches();
    return { success: true };
  } catch (err) {
    return { error: toMessage(err, 'Echec de la reactivation') };
  }
}

export async function actionSoftDeleteTenant(
  tenantId: string,
  reason?: string,
): Promise<ActionResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = tenantActionSchema.safeParse({ tenantId, reason });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const service = createPlatformAdminService(createAdminClient());
    await service.softDeleteTenant(
      parsed.data.tenantId,
      { userId: user.id, email: user.email },
      parsed.data.reason,
    );
    bustTenantCaches();
    return { success: true };
  } catch (err) {
    return { error: toMessage(err, 'Echec de la suppression') };
  }
}

export async function actionRestoreTenant(tenantId: string): Promise<ActionResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = tenantActionSchema.safeParse({ tenantId });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const service = createPlatformAdminService(createAdminClient());
    await service.restoreTenant(parsed.data.tenantId, { userId: user.id, email: user.email });
    bustTenantCaches();
    return { success: true };
  } catch (err) {
    return { error: toMessage(err, 'Echec de la restauration') };
  }
}

export async function actionBanAdminUser(
  adminUserId: string,
  reason?: string,
): Promise<ActionResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = adminUserActionSchema.safeParse({ adminUserId, reason });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const service = createPlatformAdminService(createAdminClient());
    await service.banAdminUser(
      parsed.data.adminUserId,
      { userId: user.id, email: user.email },
      parsed.data.reason,
    );
    revalidatePath('/admin/tenants');
    return { success: true };
  } catch (err) {
    return { error: toMessage(err, 'Echec du bannissement') };
  }
}

export async function actionUnbanAdminUser(adminUserId: string): Promise<ActionResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = adminUserActionSchema.safeParse({ adminUserId });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const service = createPlatformAdminService(createAdminClient());
    await service.unbanAdminUser(parsed.data.adminUserId, { userId: user.id, email: user.email });
    revalidatePath('/admin/tenants');
    return { success: true };
  } catch (err) {
    return { error: toMessage(err, 'Echec du debannissement') };
  }
}

export async function actionSoftDeleteAdminUser(
  adminUserId: string,
  reason?: string,
): Promise<ActionResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = adminUserActionSchema.safeParse({ adminUserId, reason });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const service = createPlatformAdminService(createAdminClient());
    await service.softDeleteAdminUser(
      parsed.data.adminUserId,
      { userId: user.id, email: user.email },
      parsed.data.reason,
    );
    revalidatePath('/admin/tenants');
    return { success: true };
  } catch (err) {
    return { error: toMessage(err, 'Echec de la suppression du compte') };
  }
}

export async function actionRestoreAdminUser(adminUserId: string): Promise<ActionResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = adminUserActionSchema.safeParse({ adminUserId });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const service = createPlatformAdminService(createAdminClient());
    await service.restoreAdminUser(parsed.data.adminUserId, { userId: user.id, email: user.email });
    revalidatePath('/admin/tenants');
    return { success: true };
  } catch (err) {
    return { error: toMessage(err, 'Echec de la restauration du compte') };
  }
}

/**
 * Read-only impersonation (option A): records an audit entry and returns the
 * tenant slug so the operator can open the tenant storefront. No session is
 * swapped - the operator only views public/storefront data with a logged trail.
 */
export async function actionImpersonateTenant(tenantId: string): Promise<ImpersonateResponse> {
  try {
    const { user } = await requireSuperAdmin();
    const parsed = tenantActionSchema.safeParse({ tenantId });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Donnees invalides' };

    const admin = createAdminClient();
    const service = createPlatformAdminService(admin);
    await service.recordImpersonation(parsed.data.tenantId, { userId: user.id, email: user.email });

    const { data, error: slugError } = await admin
      .from('tenants')
      .select('slug')
      .eq('id', parsed.data.tenantId)
      .maybeSingle();
    if (slugError) return { error: "Echec de l'acces" };
    return { success: true, slug: data?.slug };
  } catch (err) {
    return { error: toMessage(err, "Echec de l'acces") };
  }
}
