import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { signupSchema } from '@/lib/validations/auth.schema';
import { signupLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createSignupService } from '@/services/signup.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { getTranslations } from 'next-intl/server';
import { parseAbTrialFromCookieHeader } from '@/lib/ab-testing';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const t = await getTranslations('errors');

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await signupLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: t('rateLimited') },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Parse and validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t('invalidRequestBody') }, { status: 400 });
    }

    const parseResult = signupSchema.safeParse(body);
    if (!parseResult.success) {
      const rawMessage = parseResult.error.issues[0]?.message ?? t('invalidDataFallback');
      const firstError =
        rawMessage.includes('received undefined') || rawMessage.includes('required')
          ? 'Donnees invalides ou manquantes'
          : rawMessage;
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    // 3. Execute signup via service
    const supabase = createAdminClient();
    const signupService = createSignupService(supabase);

    const result = await signupService.completeEmailSignup(parseResult.data);

    // A/B test: shorten trial to 7d if variant is assigned
    const cookieHeader = request.headers.get('cookie') ?? '';
    const trialVariant = parseAbTrialFromCookieHeader(cookieHeader);
    if (trialVariant === '7d') {
      const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const { data: updated, error: trialErr } = await supabase
        .from('tenants')
        .update({ trial_ends_at: trialEndsAt })
        .eq('id', result.tenantId)
        .select('id');
      if (trialErr || !updated?.length) {
        logger.warn('AB test: failed to apply 7d trial', {
          error: trialErr,
          tenantId: result.tenantId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      slug: result.slug,
      tenantId: result.tenantId,
      requiresConfirmation: true,
      message: t('signupConfirmation'),
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Signup error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
