import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { onboardingSaveSchema } from '@/lib/validations/onboarding.schema';
import { onboardingLimiter, getClientIp } from '@/lib/rate-limit';
import { createOnboardingService } from '@/services/onboarding.service';

export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await onboardingLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429 },
      );
    }

    const supabase = await createClient();

    // 2. Validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = onboardingSaveSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Données invalides';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { step, data } = parseResult.data;

    // 3. Authenticate
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // 4. Get the user's tenant
    const { data: adminUser, error: adminUserError } = await supabase
      .from('admin_users')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (adminUserError || !adminUser) {
      return NextResponse.json({ error: 'Tenant non trouvé' }, { status: 404 });
    }

    // 5. Save step via service
    const onboardingService = createOnboardingService(supabase);
    await onboardingService.saveStep(adminUser.tenant_id, step, data);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Onboarding save error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
