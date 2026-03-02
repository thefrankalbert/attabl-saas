import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationLimiter, getClientIp } from '@/lib/rate-limit';
import { createInvitationService } from '@/services/invitation.service';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(request);
    const { success: allowed } = await invitationLimiter.check(ip);
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

    const { id } = await params;

    // Fetch the invitation to get its tenant_id
    const adminClient = createAdminClient();
    const { data: invitation } = await adminClient
      .from('invitations')
      .select('tenant_id')
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
      .single();

    if (!adminUser || !['owner', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const service = createInvitationService(adminClient);
    await service.cancelInvitation(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitation DELETE error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
