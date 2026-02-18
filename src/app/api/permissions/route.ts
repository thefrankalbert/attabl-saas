import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { permissionLimiter, getClientIp } from '@/lib/rate-limit';

export async function PUT(request: Request) {
  try {
    const ip = getClientIp(request);
    const { success: allowed } = await permissionLimiter.check(ip);
    if (!allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body: unknown = await request.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('tenant_id' in body) ||
      !('role' in body) ||
      !('permissions' in body)
    ) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const { tenant_id, role, permissions } = body as {
      tenant_id: string;
      role: string;
      permissions: Record<string, boolean>;
    };

    if (!tenant_id || !role || !permissions) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    // Verify user is owner of this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .single();

    if (!adminUser || adminUser.role !== 'owner') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { error } = await supabase.from('role_permissions').upsert(
      {
        tenant_id,
        role,
        permissions,
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
    if (!allowed) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 });

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || !('tenant_id' in body) || !('role' in body)) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const { tenant_id, role } = body as { tenant_id: string; role: string };

    if (!tenant_id || !role) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    // Verify user is owner of this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .single();

    if (!adminUser || adminUser.role !== 'owner') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('role', role);

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
