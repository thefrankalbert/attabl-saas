import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createInvitationService } from '@/services/invitation.service';
import { acceptInvitationSchema } from '@/lib/validations/invitation.schema';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import type { Tenant } from '@/types/admin.types';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const ip = getClientIp(request);
    const { success: allowed } = await invitationLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const body: unknown = await request.json();
    const parsed = acceptInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Donnees invalides', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const service = createInvitationService(adminClient);

    // Validate token first, then check plan limits before accepting
    const invitation = await service.validateToken(parsed.data.token);

    const { data: tenant } = await adminClient
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan, subscription_status, trial_ends_at, is_active, created_at',
      )
      .eq('id', invitation.tenant_id)
      .single();

    if (tenant) {
      const enforcement = createPlanEnforcementService(adminClient);
      await enforcement.canAddAdmin(tenant as Tenant);
    }

    const { tenantSlug } = await service.acceptInvitation({
      token: parsed.data.token,
      fullName: parsed.data.full_name,
      password: parsed.data.password,
    });

    return NextResponse.json({ success: true, tenantSlug });
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.details) {
        logger.error('Invitation accept ServiceError details', {
          code: error.code,
          details: error.details,
        });
      }
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitation accept error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
