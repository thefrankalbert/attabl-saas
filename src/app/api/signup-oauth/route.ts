import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { signupOAuthSchema } from '@/lib/validations/auth.schema';
import { oauthSignupLimiter, getClientIp } from '@/lib/rate-limit';
import { createSignupService } from '@/services/signup.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';

export async function POST(request: Request) {
  try {
    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await oauthSignupLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez plus tard.' },
        { status: 429 },
      );
    }

    // 2. Parse and validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = signupOAuthSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0]?.message ?? 'Données invalides';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { userId, email, restaurantName, phone, plan } = parseResult.data;

    // 3. SECURITY: Verify userId matches authenticated user (IDOR prevention)
    const supabaseAuth = await createClient();
    const {
      data: { user: authenticatedUser },
      error: authCheckError,
    } = await supabaseAuth.auth.getUser();

    if (authCheckError || !authenticatedUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    if (authenticatedUser.id !== userId) {
      logger.warn('OAuth signup: userId mismatch — possible IDOR attempt', {
        authenticatedUserId: authenticatedUser.id,
        requestedUserId: userId,
      });
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // 4. Execute signup via service
    const supabase = createAdminClient();
    const signupService = createSignupService(supabase);

    const result = await signupService.completeOAuthSignup({
      userId,
      email,
      restaurantName,
      phone,
      plan,
    });

    return NextResponse.json({
      success: true,
      slug: result.slug,
      tenantId: result.tenantId,
    });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('OAuth Signup error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
