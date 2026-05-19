import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolveSessionAdminUser } from '@/lib/auth/session-admin-user';
import { logger } from '@/lib/logger';
import { onboardingSaveSchema } from '@/lib/validations/onboarding.schema';
import { onboardingSaveLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createOnboardingService } from '@/services/onboarding.service';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await onboardingSaveLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '60' } },
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

    const session = await resolveSessionAdminUser({
      requireActive: true,
      provisionIfMissing: true,
    });
    if (!session.ok) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    // 4. Save step via service (pass full data as draft for complete restoration)
    const onboardingService = createOnboardingService(supabase);
    await onboardingService.saveStep(session.adminUser.tenant_id, step, data, data);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Onboarding save error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
