'use server';

import { z } from 'zod';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { createAssignmentService } from '@/services/assignment.service';
import { ServiceError, type ServiceErrorCode } from '@/services/errors';
import { assertTenantServing, TenantLockedError } from '@/lib/billing/assert-tenant-serving';
import { createClient } from '@/lib/supabase/server';
import { isFeatureEntitled } from '@/lib/plans/assert-feature';
import type { TableAssignment } from '@/types/admin.types';

type ActionResponse<T = undefined> = {
  success?: boolean;
  data?: T;
  error?: string;
  /** Code de la ServiceError, pour que la file hors ligne rejoue une panne interne (B7). */
  code?: ServiceErrorCode;
};

const tenantIdSchema = z.string().uuid();

async function checkPermissions(tenantId: string): Promise<{ error: string | null }> {
  try {
    await getAuthenticatedUserForTenant(tenantId, 'settings.edit');
    // Coupure du restaurant: assigner un serveur est une ecriture de service.
    await assertTenantServing(tenantId);
    return { error: null };
  } catch (err) {
    // Avant AuthError: un restaurant coupe n'a pas un probleme de permission,
    // et le message generique ci-dessous l'enverrait chercher un droit manquant.
    if (err instanceof TenantLockedError) {
      return { error: err.message };
    }
    if (err instanceof AuthError) {
      return { error: err.status === 401 ? 'Non authentifie' : 'Permissions insuffisantes' };
    }
    return { error: 'Permissions insuffisantes' };
  }
}

/**
 * SECURITY: Session membership verified before assigning server to table.
 * assignServerToTable also filters by tenant_id in the admin_users lookup
 * and includes tenant_id in the insert (belt-and-suspenders).
 */
export async function actionAssignServer(
  tenantId: string,
  tableId: string,
  serverId: string,
): Promise<ActionResponse<TableAssignment>> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedTableId = z.string().uuid().safeParse(tableId);
  const parsedServerId = z.string().uuid().safeParse(serverId);
  if (!parsedTenant.success || !parsedTableId.success || !parsedServerId.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    // Plan: "Assignation serveurs" est vendue a partir de Pro (canAccessService).
    // La page Service est fermee, mais une Server Action est un endpoint POST
    // adressable par son Action ID. Liberer une assignation reste permis.
    if (!(await isFeatureEntitled(supabase, tenantId, 'canAccessService'))) {
      return { error: "Assigner des serveurs aux tables n'est pas inclus dans votre plan." };
    }
    const assignmentService = createAssignmentService(supabase);
    const data = await assignmentService.assignServerToTable(tenantId, tableId, serverId);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message, code: err.code };
    return { error: 'Server error' };
  }
}

/**
 * SECURITY: Session membership verified before releasing assignment.
 * releaseAssignment also filters by tenant_id (belt-and-suspenders).
 */
export async function actionReleaseAssignment(
  tenantId: string,
  assignmentId: string,
): Promise<ActionResponse> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedAssignmentId = z.string().uuid().safeParse(assignmentId);
  if (!parsedTenant.success || !parsedAssignmentId.success) {
    return { error: 'Invalid input' };
  }

  const { error: permError } = await checkPermissions(tenantId);
  if (permError) return { error: permError };

  try {
    const supabase = await createClient();
    const assignmentService = createAssignmentService(supabase);
    await assignmentService.releaseAssignment(assignmentId, tenantId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message, code: err.code };
    return { error: 'Server error' };
  }
}
