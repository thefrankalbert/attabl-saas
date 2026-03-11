import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { permissionLimiter, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';

const VALID_ROLES = ['admin', 'manager', 'cashier', 'chef', 'waiter'] as const;

const updatePermissionsSchema = z.object({
  role: z.enum(VALID_ROLES, { error: 'Rôle invalide' }),
  permissions: z.record(z.string(), z.boolean()),
});

const deletePermissionsSchema = z.object({
  role: z.enum(VALID_ROLES, { error: 'Rôle invalide' }),
});

async function verifyOwner(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('tenant_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('role', 'owner')
    .single();

  return adminUser;
}

export async function PUT(request: Request) {
  try {
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

    // Derive tenant_id from authenticated user's owner record
    const adminUser = await verifyOwner(supabase, user.id);
    if (!adminUser) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { error } = await supabase.from('role_permissions').upsert(
      {
        tenant_id: adminUser.tenant_id,
        role: parsed.data.role,
        permissions: parsed.data.permissions,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
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

    // Derive tenant_id from authenticated user's owner record
    const adminUser = await verifyOwner(supabase, user.id);
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
