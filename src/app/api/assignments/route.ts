import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { assignmentLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createAssignmentService } from '@/services/assignment.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { createAssignmentSchema } from '@/lib/validations/assignment.schema';
import { jsonWithCache } from '@/lib/cache-headers';

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const { success: allowed } = await assignmentLimiter.check(ip);
    if (!allowed)
      return NextResponse.json(
        { error: 'Trop de requêtes' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');
    if (!tenantSlug) return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();
    if (!tenant) return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });

    // Verify user belongs to this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .single();
    if (!adminUser) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const service = createAssignmentService(supabase);
    const assignments = await service.getActiveAssignments(tenant.id);
    return jsonWithCache(assignments, 'realtime');
  } catch (error) {
    if (error instanceof ServiceError)
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    logger.error('Assignments GET error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const ip = getClientIp(request);
    const { success: allowed } = await assignmentLimiter.check(ip);
    if (!allowed)
      return NextResponse.json(
        { error: 'Trop de requêtes' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const headersList = await headers();
    const tenantSlug = headersList.get('x-tenant-slug');
    if (!tenantSlug) return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .single();
    if (!tenant) return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });

    // Verify user belongs to this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .single();
    if (!adminUser) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const parsed = createAssignmentSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );

    const service = createAssignmentService(supabase);
    const assignment = await service.assignServerToTable(
      tenant.id,
      parsed.data.table_id,
      parsed.data.server_id,
    );
    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError)
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    logger.error('Assignments POST error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
