import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolveSessionAdminUser } from '@/lib/auth/session-admin-user';
import { logger } from '@/lib/logger';
import { createOnboardingService } from '@/services/onboarding.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { jsonWithCache } from '@/lib/cache-headers';
import { onboardingStateLimiter, getClientIp } from '@/lib/rate-limit';
import { readOnboardingSiteParam } from '@/lib/validations/onboarding.schema';
import { isRoleAllowed, ONBOARDING_COMPLETE_ROLES } from '@/lib/admin-roles';

export async function GET(request: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await onboardingStateLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    const siteSlug = readOnboardingSiteParam(request.url);
    if (siteSlug === undefined) {
      return NextResponse.json({ error: 'Parametre site invalide' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Authenticate + resolve the tenant (scoped to the session user). The
    //    state is read for THIS tenant: the same choice the save and complete
    //    routes make, so the screen and the writes cannot disagree.
    const session = await resolveSessionAdminUser({
      requireActive: true,
      provisionIfMissing: true,
      siteSlug,
      ownerOnly: true,
    });
    if (!session.ok) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    if (!isRoleAllowed(session.adminUser.role, ONBOARDING_COMPLETE_ROLES)) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Get state via service
    const onboardingService = createOnboardingService(supabase);
    const state = await onboardingService.getState(session.adminUser.tenant_id);

    // no-store: l'etat onboarding est per-user mais l'URL ne varie pas par user.
    // Un cache navigateur ('dynamic' = private,max-age=60) reservirait l'etat du user
    // precedent au suivant sur un navigateur partage.
    return jsonWithCache(state, 'realtime');
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Onboarding state error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
