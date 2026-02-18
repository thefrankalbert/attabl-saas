import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { invitationLimiter, getClientIp } from '@/lib/rate-limit';
import { createInvitationService } from '@/services/invitation.service';
import { acceptInvitationSchema } from '@/lib/validations/invitation.schema';

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
    const { tenantSlug } = await service.acceptInvitation({
      token: parsed.data.token,
      fullName: parsed.data.full_name,
      password: parsed.data.password,
    });

    return NextResponse.json({ success: true, tenantSlug });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.details ? { details: error.details } : {}) },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Invitation accept error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
