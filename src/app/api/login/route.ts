import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { loginSchema } from '@/lib/validations/auth.schema';
import { loginLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { getTranslations } from 'next-intl/server';

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

    // 3. Query admin_users for routing info
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select('tenant_id, is_super_admin, role, tenants(slug, onboarding_completed)')
      .eq('user_id', authData.user.id);

    // Anti-enumeration: don't expose that the email is valid but has no tenant.
    // A successful signInWithPassword on an email with no admin_users row is a
    // recoverable state (user dropped out mid-onboarding). Route them to the
    // onboarding flow so the front end can re-seed the tenant instead of
    // leaking "ce compte existe mais n'a pas d'etablissement".
    if (!adminUsers || adminUsers.length === 0) {
      return NextResponse.json({ success: true, redirect: '/onboarding' });
    }

    // 4. Determine redirect
    const needsOnboarding = adminUsers.some((au) => {
      // Supabase join type gap
      const tenant = au.tenants as unknown as { onboarding_completed: boolean } | null;
      return tenant?.onboarding_completed === false;
    });

    return NextResponse.json({
      success: true,
      redirect: needsOnboarding ? '/onboarding' : '/admin/tenants',
    });
  } catch (error) {
    logger.error('Login route error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
