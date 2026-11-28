import { isMfaSatisfied, MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE } from '@/lib/auth/mfa-assurance';
import { createClient } from '@/lib/supabase/server';
import { readTenantSlug } from '@/lib/auth/tenant-header';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';
import { assignmentLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createAssignmentService } from '@/services/assignment.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { parseRouteUuid } from '@/lib/validations/common.schema';
import { resolveLiveMember } from '@/lib/auth/resolve-admin-permission';
import { tenantLockResponse } from '@/lib/billing/tenant-lock-response';

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

    if (!(await isMfaSatisfied(supabase, user))) {
      return NextResponse.json(
        { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
        { status: 403 },
      );
    }

    const headersList = await headers();
    const tenantSlug = readTenantSlug(headersList).slug;
    if (!tenantSlug) return NextResponse.json({ error: 'Tenant non identifié' }, { status: 400 });

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .is('deleted_at', null)
      .single();
    if (!tenant) return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });

    // Membre VIVANT du restaurant, et droit de prendre des commandes. Prendre
    // une commande en charge est un geste de SALLE: `orders.take` (le chef, qui
    // suit en cuisine, ne sert pas une table).
    const member = await resolveLiveMember(supabase, user.id, tenant.id);
    if (!member) return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    if (member.levels['orders.take'] !== 'full') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Coupure du restaurant: prendre une commande en charge est une ecriture de service.
    const locked = await tenantLockResponse(tenant.id);
    if (locked) return locked;

    const { id: rawId } = await params;
    const parsedId = parseRouteUuid(rawId);
    if (!parsedId.ok) {
      return NextResponse.json({ error: parsedId.error }, { status: 400 });
    }
    const id = parsedId.id;

    // Use admin_users.id (not auth user.id) since orders.server_id references admin_users(id)
    const service = createAssignmentService(supabase);
    await service.claimOrder(id, member.adminUserId, tenant.id);
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
