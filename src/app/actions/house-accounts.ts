'use server';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import {
  createOrderAnnotationService,
  type HouseAccountBalance,
} from '@/services/order-annotation.service';
import { createHouseAccountSettlementService } from '@/services/house-account-settlement.service';
import { ServiceError } from '@/services/errors';
import { assertTenantServing } from '@/lib/billing/assert-tenant-serving';
import { ALL_ADMIN_ROLES, ORDER_MONEY_ROLES, ORDER_PAY_PERMISSIONS } from '@/lib/admin-roles';
import {
  houseAccountSchema,
  attachHouseAccountSchema,
  settleHouseAccountSchema,
} from '@/lib/validations/house-account.schema';

/**
 * House account (ardoise / running tab) server actions. The tenant is verified
 * against the authenticated membership (IDOR-safe); created_by / settled_by use
 * the actor's admin_users.id. An ardoise is money: every action needs
 * ORDER_PAY_PERMISSIONS (the waiter and the chef do not hold `orders.pay` by
 * default - owner decision of 2026-11-09). Create + settle are, on top of
 * that, manager privileges (ORDER_MONEY_ROLES).
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
      ORDER_MONEY_ROLES,
      ORDER_PAY_PERMISSIONS,
    );
    // Coupure du restaurant: solder une ardoise est un encaissement, et ces
    // actions sont appelees en direct par l'interface. Voir
    // assert-tenant-serving.ts.
    await assertTenantServing(parsedTenant.data);
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

/** List house accounts with outstanding balances (read-only, money staff). */
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
      ALL_ADMIN_ROLES,
      ORDER_PAY_PERMISSIONS,
    );
    const accounts = await createOrderAnnotationService(supabase).listHouseAccountsWithBalances(
      parsedTenant.data,
    );
    return { accounts };
  } catch (err) {
    return mapError(err, 'actionListHouseAccounts', tenantId);
  }
}

/** Attach an order to a house account (put it on the tab). Money staff. */
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
      ALL_ADMIN_ROLES,
      ORDER_PAY_PERMISSIONS,
    );
    // Coupure du restaurant: solder une ardoise est un encaissement, et ces
    // actions sont appelees en direct par l'interface. Voir
    // assert-tenant-serving.ts.
    await assertTenantServing(parsedTenant.data);
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

/** Detach an order from its house account. Money staff. */
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
      ALL_ADMIN_ROLES,
      ORDER_PAY_PERMISSIONS,
    );
    // Coupure du restaurant: solder une ardoise est un encaissement, et ces
    // actions sont appelees en direct par l'interface. Voir
    // assert-tenant-serving.ts.
    await assertTenantServing(parsedTenant.data);
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
      ORDER_MONEY_ROLES,
      ORDER_PAY_PERMISSIONS,
    );
    // Coupure du restaurant: solder une ardoise est un encaissement, et ces
    // actions sont appelees en direct par l'interface. Voir
    // assert-tenant-serving.ts.
    await assertTenantServing(parsedTenant.data);
    // Encaisse le reste du de chaque commande au registre, PUIS ferme
    // l'ardoise. Voir house-account-settlement.service.ts.
    await createHouseAccountSettlementService(supabase).settle(
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
