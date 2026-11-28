import { isMfaSatisfied, MFA_REQUIRED_CODE, MFA_REQUIRED_MESSAGE } from '@/lib/auth/mfa-assurance';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationManageLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createInvitationService } from '@/services/invitation.service';
import { parseRouteUuid } from '@/lib/validations/common.schema';
import { canManageInvitation } from '@/lib/auth/invitation-authority';

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

    if (!(await isMfaSatisfied(supabase, user))) {
      return NextResponse.json(
        { error: MFA_REQUIRED_MESSAGE, code: MFA_REQUIRED_CODE },
        { status: 403 },
      );
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
      .select('tenant_id, postes, permission_overrides')
      .eq('id', id)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
    }

    // `team.manage`, et autorite sur ce que l'invitation donnerait: la regle
    // pour DONNER (inclus ou egal). Un gerant defait l'invitation d'un gerant,
    // jamais celle qui porte un droit qu'il n'a pas (voir `canManageInvitation`).
    if (!(await canManageInvitation(supabase, adminClient, user.id, invitation))) {
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
