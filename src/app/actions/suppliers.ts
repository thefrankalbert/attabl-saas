'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupplierService } from '@/services/supplier.service';
import { ServiceError } from '@/services/errors';
import { getAuthenticatedUserForTenant, AuthError } from '@/lib/auth/get-session';
import { ALL_ADMIN_ROLES } from '@/lib/admin-roles';
import { isFeatureEntitled } from '@/lib/plans/assert-feature';
import { phoneSchema } from '@/lib/validations/common.schema';
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from '@/types/supplier.types';

// Les fournisseurs font partie du module Inventaire, fonctionnalite Pro. Une
// Server Action est un endpoint POST adressable: gater la page ne suffit pas.
const SUPPLIERS_PLAN_ERROR = 'Le module Fournisseurs est reserve au plan Pro.';

const uuidSchema = z.string().uuid();

// C-046: nom de 400 caracteres et telephone "abc" etaient acceptes. Les
// valeurs VALIDEES (rognees) sont celles transmises au service.
const supplierName = z
  .string()
  .trim()
  .min(1, 'Le nom est requis')
  .max(100, 'Maximum 100 caractères');
const shortText = z.string().trim().max(100, 'Maximum 100 caractères');
const supplierEmail = z.union([z.literal(''), z.string().trim().email('Adresse e-mail invalide')]);

const supplierFieldsSchema = z.object({
  name: supplierName,
  contact_name: shortText.optional(),
  phone: phoneSchema.optional(),
  email: supplierEmail.optional(),
  address: z.string().trim().max(300, 'Maximum 300 caractères').optional(),
  notes: z.string().trim().max(1000, 'Maximum 1000 caractères').optional(),
});

const updateSupplierFieldsSchema = z.object({
  name: supplierName.optional(),
  contact_name: shortText.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  email: supplierEmail.nullable().optional(),
  address: z.string().trim().max(300, 'Maximum 300 caractères').nullable().optional(),
  notes: z.string().trim().max(1000, 'Maximum 1000 caractères').nullable().optional(),
  is_active: z.boolean().optional(),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Données invalides';
}

type ActionResult<T = undefined> =
  | { success: true; data?: T; error?: never }
  | { success?: never; error: string };

async function checkSupplierPermissions(
  tenantId: string,
): Promise<{ error: null; supabase: SupabaseClient } | { error: string; supabase: null }> {
  try {
    const { supabase } = await getAuthenticatedUserForTenant(
      tenantId,
      ALL_ADMIN_ROLES,
      'inventory.edit',
    );
    if (!(await isFeatureEntitled(supabase, tenantId, 'canAccessInventory'))) {
      return { error: SUPPLIERS_PLAN_ERROR, supabase: null };
    }
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
  const parsed = supplierFieldsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!uuidSchema.safeParse(tenantId).success) return { error: 'Invalid input' };

  const { error: permError, supabase } = await checkSupplierPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createSupplierService(supabase);
    const data = await service.createSupplier(tenantId, parsed.data);
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
  const parsed = updateSupplierFieldsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (!uuidSchema.safeParse(tenantId).success || !uuidSchema.safeParse(supplierId).success) {
    return { error: 'Invalid input' };
  }

  const { error: permError, supabase } = await checkSupplierPermissions(tenantId);
  if (permError || !supabase) return { error: permError ?? 'Erreur serveur' };

  try {
    const service = createSupplierService(supabase);
    const data = await service.updateSupplier(supplierId, tenantId, parsed.data);
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
