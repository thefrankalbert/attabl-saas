import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { loginSchema } from '@/lib/validations/auth.schema';
import { loginLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    // 0. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await loginLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }

    // 1. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }

    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Email ou mot de passe invalide.' }, { status: 400 });
    }

    const { email, password } = parseResult.data;

    // 2. Authenticate with Supabase
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Generic error message to prevent user enumeration
      if (authError.message.includes('Invalid login credentials')) {
        return NextResponse.json({ error: 'Email ou mot de passe incorrect.' }, { status: 401 });
      }
      if (authError.message.includes('Email not confirmed')) {
        return NextResponse.json({ error: 'email_not_confirmed', email }, { status: 403 });
      }
      logger.error('Login failed', authError);
      return NextResponse.json(
        { error: 'Erreur de connexion. Veuillez reessayer.' },
        { status: 401 },
      );
    }

    // 3. Query admin_users for routing info
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select('tenant_id, is_super_admin, role, tenants(slug, onboarding_completed)')
      .eq('user_id', authData.user.id);

    if (!adminUsers || adminUsers.length === 0) {
      return NextResponse.json(
        { error: 'Aucun etablissement associe a ce compte' },
        { status: 403 },
      );
    }

    // 4. Determine redirect
    const needsOnboarding = adminUsers.some((au) => {
      const t = au.tenants as unknown as { onboarding_completed: boolean } | null;
      return t?.onboarding_completed === false;
    });

    return NextResponse.json({
      success: true,
      redirect: needsOnboarding ? '/onboarding' : '/admin/tenants',
    });
  } catch (error) {
    logger.error('Login route error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
