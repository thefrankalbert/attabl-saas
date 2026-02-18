import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationLimiter, getClientIp } from '@/lib/rate-limit';
import { createInvitationService } from '@/services/invitation.service';
import { createInvitationSchema } from '@/lib/validations/invitation.schema';
import { sendInvitationEmail } from '@/services/email.service';

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const { success: allowed } = await invitationLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenant_id');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id requis' }, { status: 400 });
    }

    // Verify caller is owner or admin of this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!adminUser || !['owner', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const service = createInvitationService(adminClient);
    const invitations = await service.getPendingInvitations(tenantId);

    return NextResponse.json({ invitations });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitations GET error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { success: allowed } = await invitationLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Donnees invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Extract tenant_id from body (not part of Zod schema)
    const tenantId = (body as Record<string, unknown>).tenant_id;
    if (!tenantId || typeof tenantId !== 'string') {
      return NextResponse.json({ error: 'tenant_id requis' }, { status: 400 });
    }

    // Verify caller is owner or admin of this tenant
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!adminUser || !['owner', 'admin'].includes(adminUser.role)) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const service = createInvitationService(adminClient);
    const invitation = await service.createInvitation({
      tenantId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedBy: user.id,
      customPermissions: parsed.data.custom_permissions,
    });

    // Send invitation email only if the invitation is pending (not direct-add)
    if (invitation.status === 'pending') {
      const { data: tenant } = await adminClient
        .from('tenants')
        .select('name, logo_url, slug')
        .eq('id', tenantId)
        .single();

      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com'}/auth/accept-invite?token=${invitation.token}`;

      await sendInvitationEmail(parsed.data.email, {
        restaurantName: tenant?.name || 'Restaurant',
        restaurantLogoUrl: tenant?.logo_url || undefined,
        role: parsed.data.role,
        inviteUrl,
      });
    }

    return NextResponse.json({ success: true, invitation }, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitations POST error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
