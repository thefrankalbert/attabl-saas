import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationManageLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createInvitationService } from '@/services/invitation.service';
import { parseRouteUuid } from '@/lib/validations/common.schema';
import { canActOnUser } from '@/lib/auth/role-hierarchy';
import type { AdminRole } from '@/types/admin.types';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const ip = getClientIp(request);
    const { success: allowed } = await invitationManageLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const { id: rawId } = await params;
    const parsedId = parseRouteUuid(rawId);
    if (!parsedId.ok) {
      return NextResponse.json({ error: parsedId.error }, { status: 400 });
    }
    const id = parsedId.id;

    // Fetch the invitation to get its tenant_id
    const adminClient = createAdminClient();
    const { data: invitation } = await adminClient
      .from('invitations')
      .select('tenant_id, role')
      .eq('id', id)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
    }

    // Verify caller is owner or admin of this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', invitation.tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!adminUser || !['owner', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    // Anti-escalation: an admin cannot cancel an invitation for a peer/higher
    // role (e.g. one the owner created for another admin/owner). Mirrors the
    // canGrantRole gate on the create path.
    if (!canActOnUser(adminUser.role as AdminRole, invitation.role as AdminRole)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const service = createInvitationService(adminClient);
    await service.cancelInvitation(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Invitation DELETE ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitation DELETE error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
