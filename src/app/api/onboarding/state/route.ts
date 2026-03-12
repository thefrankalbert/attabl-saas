import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
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

    // 2. Get state via service
    const onboardingService = createOnboardingService(supabase);
    const state = await onboardingService.getState(user.id);

    return jsonWithCache(state, 'dynamic');
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
