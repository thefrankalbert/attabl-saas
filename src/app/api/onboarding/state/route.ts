import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolveSessionAdminUser } from '@/lib/auth/session-admin-user';
import { logger } from '@/lib/logger';
import { createOnboardingService } from '@/services/onboarding.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { jsonWithCache } from '@/lib/cache-headers';
import { onboardingStateLimiter, getClientIp } from '@/lib/rate-limit';

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
    const supabase = await createClient();

    // 1. Authenticate
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const session = await resolveSessionAdminUser({
      requireActive: true,
      provisionIfMissing: true,
    });
    if (!session.ok) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    // 2. Get state via service
    const onboardingService = createOnboardingService(supabase);
    const state = await onboardingService.getState(user.id);

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
