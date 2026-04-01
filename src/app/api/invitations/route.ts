import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationLimiter, getClientIp } from '@/lib/rate-limit';
import { createInvitationService } from '@/services/invitation.service';
import { createInvitationSchema } from '@/lib/validations/invitation.schema';
import { sendInvitationEmail } from '@/services/email.service';
import { jsonWithCache } from '@/lib/cache-headers';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import type { Tenant } from '@/types/admin.types';

export async function GET(request: Request) {
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

    // Derive tenant_id from the authenticated user's session
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['owner', 'admin'])
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const tenantId = adminUser.tenant_id;

    const adminClient = createAdminClient();
    const service = createInvitationService(adminClient);
    const invitations = await service.getPendingInvitations(tenantId);

    // Strip sensitive token field before returning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const sanitized = invitations.map(({ token: _token, ...rest }) => rest);

    return jsonWithCache({ invitations: sanitized }, 'dynamic');
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Invitations GET ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
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

    const body: unknown = await request.json();
    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Donnees invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Derive tenant_id from the authenticated user's session - never from client input
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['owner', 'admin'])
      .single();

    if (!adminUser) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const tenantId = adminUser.tenant_id;

    const adminClient = createAdminClient();

    // Check plan limits before creating invitation
    const { data: tenant } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', tenantId)
      .single();

    if (tenant) {
      const enforcement = createPlanEnforcementService(adminClient);
      await enforcement.canAddAdmin(tenant as Tenant);
    }

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

    // Strip sensitive token field before returning
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token: _token, ...sanitizedInvitation } = invitation;
    return NextResponse.json({ success: true, invitation: sanitizedInvitation }, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Invitations POST ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitations POST error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
