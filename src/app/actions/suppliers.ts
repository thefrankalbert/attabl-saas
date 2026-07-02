'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupplierService } from '@/services/supplier.service';
import { ServiceError } from '@/services/errors';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from '@/types/supplier.types';

const ALLOWED_ROLES = ['owner', 'admin', 'manager'] as const;

const uuidSchema = z.string().uuid();

const createSupplierSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const updateSupplierSchema = z.object({
  tenantId: z.string().uuid(),
  supplierId: z.string().uuid(),
  name: z.string().min(1).optional(),
  contact_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

type ActionResult<T = undefined> =
  | { success: true; data?: T; error?: never }
  | { success?: never; error: string };

async function checkSupplierPermissions(
  tenantId: string,
): Promise<{ error: null; supabase: SupabaseClient } | { error: string; supabase: null }> {
  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      tenantId,
      [...ALLOWED_ROLES],
      'inventory.edit',
    );
    return { error: null, supabase };
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 401) return { error: 'Non authentifie', supabase: null };
      return { error: 'Permissions insuffisantes', supabase: null };
    }
    return { error: 'Permissions insuffisantes', supabase: null };
  }
}

/**
 * SECURITY: Creates a new supplier for the tenant.
 * Session membership verified server-side.
 */
export async function actionCreateSupplier(
  tenantId: string,
  input: CreateSupplierInput,
): Promise<ActionResult<Supplier>> {
  const parsed = createSupplierSchema.safeParse({ tenantId, ...input });
  if (!parsed.success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkSupplierPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createSupplierService(supabase);
    const data = await service.createSupplier(tenantId, input);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Updates a supplier for the tenant.
 * Session membership verified server-side; service filters by both id and tenant_id.
 */
export async function actionUpdateSupplier(
  tenantId: string,
  supplierId: string,
  input: UpdateSupplierInput,
): Promise<ActionResult<Supplier>> {
  const parsed = updateSupplierSchema.safeParse({ tenantId, supplierId, ...input });
  if (!parsed.success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkSupplierPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createSupplierService(supabase);
    const data = await service.updateSupplier(supplierId, tenantId, input);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}

/**
 * SECURITY: Deletes a supplier for the tenant.
 * Session membership verified server-side; service filters by both id and tenant_id.
 */
export async function actionDeleteSupplier(
  tenantId: string,
  supplierId: string,
): Promise<ActionResult> {
  const parsedTenant = uuidSchema.safeParse(tenantId);
  const parsedSupplier = uuidSchema.safeParse(supplierId);
  if (!parsedTenant.success || !parsedSupplier.success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkSupplierPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createSupplierService(supabase);
    await service.deleteSupplier(supplierId, tenantId);
    return { success: true };
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message };
    return { error: 'Erreur serveur' };
  }
}
