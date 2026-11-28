import { isMfaSatisfied, MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE } from '@/lib/auth/mfa-assurance';
import { NextResponse } from 'next/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { permissionLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { z } from 'zod';
import { PERMISSION_CODES, STAFF_POSTES } from '@/types/permission.types';
import { tenantLockResponse } from '@/lib/billing/tenant-lock-response';

// Reglage d'un POSTE par le proprietaire (`poste_permissions`). `owner` n'est
// pas reglable: il a toujours tous les droits. Cles limitees aux 22 codes du
// catalogue (le CHECK `private.droits_valides` de la base refuse aussi une cle
// libre).
// partialRecord, not record: with enum keys zod 4 makes z.record exhaustive,
// while the editor sends only the overrides that differ from the default.
const permissionsMapSchema = z
  .partialRecord(z.enum(PERMISSION_CODES), z.boolean())
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one permission must be provided',
  });

const posteSchema = z.enum(STAFF_POSTES, { error: 'Poste invalide' });

const updatePermissionsSchema = z.object({
  poste: posteSchema,
  permissions: permissionsMapSchema,
});

const deletePermissionsSchema = z.object({
  poste: posteSchema,
});

// Resolves the tenant from the sub-domain context (x-tenant-slug, injected by
// the proxy) and confirms the caller is its LIVE owner. Scoping by tenant
// (instead of picking an arbitrary owner row) means a user who owns several
// restaurants only edits the permissions of the one they are viewing. La base
// applique la meme regle (`is_tenant_owner` dans les politiques).
async function verifyOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tenantId: string,
) {
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('id, tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .contains('postes', ['owner'])
    .maybeSingle();

  return adminUser;
}

async function resolveTenantId(): Promise<string | null> {
  const tenantSlug = readTenantSlug(await headers()).slug;
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

    if (!(await isMfaSatisfied(supabase, user))) {
      return NextResponse.json(
        { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
        { status: 403 },
      );
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

    // Coupure du restaurant: regler des permissions est une ecriture. Le DELETE
    // (revoquer) reste permis: c'est une sortie de securite.
    const locked = await tenantLockResponse(adminUser.tenant_id);
    if (locked) return locked;

    const { error } = await supabase.from('poste_permissions').upsert(
      {
        tenant_id: adminUser.tenant_id,
        poste: parsed.data.poste,
        permissions: parsed.data.permissions,
        updated_at: new Date().toISOString(),
        // FK poste_permissions.updated_by references admin_users(id), NOT
        // auth.users. user.id is the auth user id; use the membership-row PK.
        updated_by: adminUser.id,
      },
      { onConflict: 'tenant_id,poste' },
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

    if (!(await isMfaSatisfied(supabase, user))) {
      return NextResponse.json(
        { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
        { status: 403 },
      );
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
      .from('poste_permissions')
      .delete()
      .eq('tenant_id', adminUser.tenant_id)
      .eq('poste', parsed.data.poste);

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
