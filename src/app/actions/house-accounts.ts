'use server';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import {
  createOrderAnnotationService,
  type HouseAccountBalance,
} from '@/services/order-annotation.service';
import { ServiceError } from '@/services/errors';
import {
  houseAccountSchema,
  attachHouseAccountSchema,
  settleHouseAccountSchema,
} from '@/lib/validations/house-account.schema';

/**
 * House account (ardoise / running tab) server actions. The tenant is verified
 * against the authenticated membership (IDOR-safe); created_by / settled_by use
 * the actor's admin_users.id. Create + settle are manager privileges; attach /
 * detach / list are open to staff (server or above).
 */

const tenantIdSchema = z.string().uuid();

/** Create a new house account. Manager or above. */
export async function actionCreateHouseAccount(
  tenantId: string,
  name: string,
  description?: string,
): Promise<{ success?: boolean; id?: string; error?: string }> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsed = houseAccountSchema.safeParse({ name, description });
  if (!parsedTenant.success || !parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase, adminUserId } = await getAuthenticatedUserForTenant(
      parsedTenant.data,
      ['owner', 'admin', 'manager'],
      'orders.manage',
    );
    const { id } = await createOrderAnnotationService(supabase).createHouseAccount(
      parsedTenant.data,
      {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        createdBy: adminUserId,
      },
    );
    return { success: true, id };
  } catch (err) {
    return mapError(err, 'actionCreateHouseAccount', tenantId);
  }
}

/** List house accounts with outstanding balances. Staff or above (read-only). */
export async function actionListHouseAccounts(
  tenantId: string,
): Promise<{ accounts?: HouseAccountBalance[]; error?: string }> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  if (!parsedTenant.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      parsedTenant.data,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );
    const accounts = await createOrderAnnotationService(supabase).listHouseAccountsWithBalances(
      parsedTenant.data,
    );
    return { accounts };
  } catch (err) {
    return mapError(err, 'actionListHouseAccounts', tenantId);
  }
}

/** Attach an order to a house account (put it on the tab). Staff or above. */
export async function actionAttachOrderToHouseAccount(
  tenantId: string,
  orderId: string,
  accountId: string,
): Promise<{ success?: boolean; error?: string }> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsed = attachHouseAccountSchema.safeParse({ orderId, accountId });
  if (!parsedTenant.success || !parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      parsedTenant.data,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );
    await createOrderAnnotationService(supabase).attachOrderToHouseAccount(
      parsed.data.orderId,
      parsedTenant.data,
      parsed.data.accountId,
    );
    return { success: true };
  } catch (err) {
    return mapError(err, 'actionAttachOrderToHouseAccount', tenantId);
  }
}

/** Detach an order from its house account. Staff or above. */
export async function actionDetachOrder(
  tenantId: string,
  orderId: string,
): Promise<{ success?: boolean; error?: string }> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsedOrder = z.string().uuid().safeParse(orderId);
  if (!parsedTenant.success || !parsedOrder.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      parsedTenant.data,
      ['owner', 'admin', 'manager', 'server'],
      'orders.manage',
    );
    await createOrderAnnotationService(supabase).detachOrderFromHouseAccount(
      parsedOrder.data,
      parsedTenant.data,
    );
    return { success: true };
  } catch (err) {
    return mapError(err, 'actionDetachOrder', tenantId);
  }
}

/** Settle (solder) a house account. Manager or above. */
export async function actionSettleHouseAccount(
  tenantId: string,
  accountId: string,
): Promise<{ success?: boolean; error?: string }> {
  const parsedTenant = tenantIdSchema.safeParse(tenantId);
  const parsed = settleHouseAccountSchema.safeParse({ accountId });
  if (!parsedTenant.success || !parsed.success) {
    return { error: 'Donnees invalides' };
  }

  try {
    const { supabase, adminUserId } = await getAuthenticatedUserForTenant(
      parsedTenant.data,
      ['owner', 'admin', 'manager'],
      'orders.manage',
    );
    await createOrderAnnotationService(supabase).settleHouseAccount(
      parsed.data.accountId,
      parsedTenant.data,
      { settledBy: adminUserId },
    );
    return { success: true };
  } catch (err) {
    return mapError(err, 'actionSettleHouseAccount', tenantId);
  }
}

function mapError(err: unknown, action: string, tenantId: string): { error: string } {
  if (err instanceof AuthError) {
    return { error: err.message };
  }
  if (err instanceof ServiceError) {
    return { error: err.message };
  }
  logger.error(`${action}: unexpected error`, { err, tenantId });
  return { error: 'Erreur interne' };
}
