import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createOnboardingService } from '@/services/onboarding.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

export async function GET() {
  try {
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

    return NextResponse.json(state);
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
