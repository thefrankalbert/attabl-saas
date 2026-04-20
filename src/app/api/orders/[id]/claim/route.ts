import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { assignmentLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createAssignmentService } from '@/services/assignment.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      .select('id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .single();
    if (!adminUser) return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });

    const CLAIM_ALLOWED_ROLES = ['owner', 'manager', 'cashier', 'waiter'];
    if (!CLAIM_ALLOWED_ROLES.includes(adminUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;

    // Use admin_users.id (not auth user.id) since orders.server_id references admin_users(id)
    const service = createAssignmentService(supabase);
    await service.claimOrder(id, adminUser.id, tenant.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError)
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    logger.error('Claim order error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
