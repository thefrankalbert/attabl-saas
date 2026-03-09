import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationLimiter, getClientIp } from '@/lib/rate-limit';
import { createInvitationService } from '@/services/invitation.service';
import { sendInvitationEmail } from '@/services/email.service';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const { data: existingInvitation } = await adminClient
      .from('invitations')
      .select('tenant_id')
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
      .single();

    if (!adminUser || !['owner', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
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

    await sendInvitationEmail(invitation.email, {
      restaurantName: tenant?.name || 'Restaurant',
      restaurantLogoUrl: tenant?.logo_url || undefined,
      role: invitation.role,
      inviteUrl,
    });

    // Strip sensitive token field before returning
    const { token: _token, ...sanitizedInvitation } = invitation;
    return NextResponse.json({ success: true, invitation: sanitizedInvitation });
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
