import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { permissionLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { z } from 'zod';
import { PERMISSION_CODES } from '@/types/permission.types';

const VALID_ROLES = ['admin', 'manager', 'cashier', 'chef', 'waiter'] as const;

// Whitelist the permission keys to the PERMISSION_CODES enum. Previously the
// schema accepted z.record(z.string(), z.boolean()), which let a compromised
// owner account inject arbitrary keys into role_permissions.permissions that a
// lax front-end check might honor as "granted".
const permissionsMapSchema = z
  .record(z.enum(PERMISSION_CODES), z.boolean())
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one permission must be provided',
  });

const updatePermissionsSchema = z.object({
  role: z.enum(VALID_ROLES, { error: 'Rôle invalide' }),
  permissions: permissionsMapSchema,
});

const deletePermissionsSchema = z.object({
  role: z.enum(VALID_ROLES, { error: 'Rôle invalide' }),
});

// Resolves the tenant from the sub-domain context (x-tenant-slug, injected by
// the proxy) and confirms the caller is its active owner. Scoping by tenant
// (instead of picking an arbitrary owner row) means a user who owns several
// restaurants only edits the permissions of the one they are viewing.
async function verifyOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tenantId: string,
) {
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, tenant_id, role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('role', 'owner')
    .maybeSingle();

  return adminUser;
}

async function resolveTenantId(): Promise<string | null> {
  const tenantSlug = (await headers()).get('x-tenant-slug');
  if (!tenantSlug) return null;
  const tenant = await getTenant(tenantSlug);
  return tenant?.id ?? null;
}

export async function PUT(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const ip = getClientIp(request);
    const { success: allowed } = await permissionLimiter.check(ip);
    if (!allowed)
      return NextResponse.json(
        { error: 'Trop de requêtes' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = updatePermissionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Données invalides' },
        { status: 400 },
      );
    }

    // Resolve the tenant from the sub-domain context, then confirm ownership.
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant introuvable' }, { status: 400 });
    }
    const adminUser = await verifyOwner(supabase, user.id, tenantId);
    if (!adminUser) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { error } = await supabase.from('role_permissions').upsert(
      {
        tenant_id: adminUser.tenant_id,
        role: parsed.data.role,
        permissions: parsed.data.permissions,
        updated_at: new Date().toISOString(),
        // FK role_permissions_updated_by_fkey references admin_users(id), NOT
        // auth.users. user.id is the auth user id; use the membership-row PK.
        updated_by: adminUser.id,
      },
      { onConflict: 'tenant_id,role' },
    );

    if (error) {
      logger.error('Permission upsert error', error);
      return NextResponse.json({ error: 'Erreur de sauvegarde' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Permission API error', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const ip = getClientIp(request);
    const { success: allowed } = await permissionLimiter.check(ip);
    if (!allowed)
      return NextResponse.json(
        { error: 'Trop de requêtes' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = deletePermissionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Données invalides' },
        { status: 400 },
      );
    }

    // Resolve the tenant from the sub-domain context, then confirm ownership.
    const tenantId = await resolveTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant introuvable' }, { status: 400 });
    }
    const adminUser = await verifyOwner(supabase, user.id, tenantId);
    if (!adminUser) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('tenant_id', adminUser.tenant_id)
      .eq('role', parsed.data.role);

    if (error) {
      logger.error('Permission delete error', error);
      return NextResponse.json({ error: 'Erreur de suppression' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Permission API error', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
