import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import {
  invitationManageLimiter,
  invitationTenantDailyLimiter,
  getClientIp,
} from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createInvitationService } from '@/services/invitation.service';
import { sendInvitationEmail } from '@/services/email.service';
import { parseRouteUuid } from '@/lib/validations/common.schema';
import { canActOnUser } from '@/lib/auth/role-hierarchy';
import type { AdminRole } from '@/types/admin.types';
import { resolveAdminPermission } from '@/lib/auth/resolve-admin-permission';
import { getTranslations } from 'next-intl/server';
import { retryAfterSeconds } from '@/lib/retry-after';
import { tenantLockResponse } from '@/lib/billing/tenant-lock-response';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const { data: existingInvitation } = await adminClient
      .from('invitations')
      .select('tenant_id, role')
      .eq('id', id)
      .single();

    if (!existingInvitation) {
      return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
    }

    // Verify caller is owner or admin of this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', existingInvitation.tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!adminUser || !['owner', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    // Inviter fait entrer du personnel: meme permission que creer un membre
    // (team.manage, check-tenant-admin). Sans elle, un admin a qui le
    // proprietaire avait retire team.manage invitait encore.
    const { allowed: canManageTeam } = await resolveAdminPermission(
      supabase,
      user.id,
      existingInvitation.tenant_id,
      'team.manage',
    );
    if (!canManageTeam) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    // Coupure du restaurant: renvoyer une invitation envoie un courriel reel.
    const locked = await tenantLockResponse(existingInvitation.tenant_id);
    if (locked) return locked;

    // Anti-escalation: an admin cannot resend an invitation for a peer/higher
    // role (e.g. one the owner created for another admin/owner). Mirrors the
    // canGrantRole gate on the create path.
    if (!canActOnUser(adminUser.role as AdminRole, existingInvitation.role as AdminRole)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    // P-10: un renvoi envoie un courriel reel comme une creation: meme plafond
    // quotidien par restaurant (sinon un renvoi en boucle contourne la limite).
    const daily = await invitationTenantDailyLimiter.check(existingInvitation.tenant_id);
    if (!daily.success) {
      const te = await getTranslations('errors');
      return NextResponse.json(
        { error: te('invitationDailyLimit') },
        { status: 429, headers: { 'Retry-After': retryAfterSeconds(daily.reset) } },
      );
    }

    const service = createInvitationService(adminClient);
    const invitation = await service.resendInvitation(id);

    // Fetch tenant info for the email
    const { data: tenant } = await adminClient
      .from('tenants')
      .select('name, logo_url, slug')
      .eq('id', invitation.tenant_id)
      .single();

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com'}/auth/accept-invite?token=${invitation.token}`;

    // Le resultat de l'envoi etait ignore: "Invitation renvoyee" s'affichait
    // meme quand le courriel n'etait pas parti (audit 2026-11-10, C-031). On
    // le rapporte comme la creation d'invitation (`emailSent`).
    let emailSent = false;
    try {
      emailSent = await sendInvitationEmail(invitation.email, {
        restaurantName: tenant?.name || 'Restaurant',
        restaurantLogoUrl: tenant?.logo_url || undefined,
        role: invitation.role,
        inviteUrl,
      });
    } catch (emailError) {
      logger.error('Invitation resend email threw', { invitationId: id, error: emailError });
    }
    if (!emailSent) {
      logger.error('Invitation resend email failed', { invitationId: id });
    }

    // Strip sensitive token field before returning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token: _token, ...sanitizedInvitation } = invitation;
    return NextResponse.json({ success: true, invitation: sanitizedInvitation, emailSent });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Invitation resend ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitation resend error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
