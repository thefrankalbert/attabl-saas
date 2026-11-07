import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { loginSchema } from '@/lib/validations/auth.schema';
import { loginLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { getTranslations } from 'next-intl/server';
import { isHoneypotTriggered } from '@/lib/honeypot';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { mapMembershipRows, postLoginDestination } from '@/lib/auth/post-login-destination';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const t = await getTranslations('errors');

    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await loginLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: t('rateLimited') },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }

    // 1. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t('invalidRequestBody') }, { status: 400 });
    }

    // 1.5 Honeypot check - silent bot rejection
    if (isHoneypotTriggered(body)) {
      return NextResponse.json({ error: t('invalidLoginFields') }, { status: 400 });
    }

    // 1.6 Turnstile verification
    const cfToken =
      typeof (body as Record<string, unknown>).cfToken === 'string'
        ? ((body as Record<string, unknown>).cfToken as string)
        : '';
    const turnstileOk = await verifyTurnstileToken(cfToken, ip);
    if (!turnstileOk) {
      return NextResponse.json({ error: t('invalidLoginFields') }, { status: 400 });
    }

    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: t('invalidLoginFields') }, { status: 400 });
    }

    const { email, password } = parseResult.data;

    // 2. Authenticate with Supabase
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Prefer Supabase's error.code (stable, locale-independent) over
      // error.message (localized by Supabase, changes across versions).
      // authError is AuthApiError which exposes a code property.
      const authCode = (authError as { code?: string }).code;

      if (authCode === 'invalid_credentials') {
        return NextResponse.json({ error: t('invalidCredentials') }, { status: 401 });
      }
      if (authCode === 'email_not_confirmed') {
        return NextResponse.json({ error: t('emailNotConfirmed'), email }, { status: 403 });
      }
      logger.error('Login failed', authError);
      return NextResponse.json({ error: t('loginError') }, { status: 401 });
    }

    // 3. Query admin_users for routing info.
    //
    // `is_active` / `deleted_at` / `created_at` sont selectionnes parce que la
    // destination en depend: un membre banni ne doit pas etre route comme un
    // membre vivant, et l'etablissement d'arrivee d'un membre de plusieurs
    // restaurants est le plus ancien (regle fixe).
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select(
        'tenant_id, is_super_admin, role, is_active, deleted_at, tenants(slug, onboarding_completed, created_at)',
      )
      .eq('user_id', authData.user.id);

    // 4. Determine redirect.
    //
    // La regle vit dans `postLoginDestination`, partagee avec le retour OAuth:
    // elle y etait ecrite deux fois, et les deux copies envoyaient TOUT role
    // vers `/admin/tenants`, qui refuse quiconque n'est pas proprietaire.
    //
    // Anti-enumeration: un compte sans aucune ligne `admin_users` est un
    // abandon d'onboarding, pas une erreur. La regle le renvoie au parcours
    // plutot que de laisser filtrer "ce compte existe mais n'a pas
    // d'etablissement".
    return NextResponse.json({
      success: true,
      redirect: postLoginDestination(mapMembershipRows(adminUsers)),
    });
  } catch (error) {
    logger.error('Login route error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
