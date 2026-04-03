import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { signupSchema } from '@/lib/validations/auth.schema';
import { signupLimiter, getClientIp } from '@/lib/rate-limit';
import { createSignupService } from '@/services/signup.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { getTranslations } from 'next-intl/server';

export async function POST(request: Request) {
  try {
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
      const firstError = parseResult.error.issues[0]?.message ?? t('invalidDataFallback');
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    // 3. Execute signup via service
    const supabase = createAdminClient();
    const signupService = createSignupService(supabase);

    const result = await signupService.completeEmailSignup(parseResult.data);

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
