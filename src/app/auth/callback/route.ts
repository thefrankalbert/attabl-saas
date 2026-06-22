import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger, hashEmail } from '@/lib/logger';
import { createSignupService } from '@/services/signup.service';
import { ServiceError } from '@/services/errors';
import { parseAbTrialFromCookieHeader } from '@/lib/ab-testing';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const plan = requestUrl.searchParams.get('plan');
  const restaurantName = requestUrl.searchParams.get('restaurant_name');

  // Handle token_hash-based recovery (custom password reset email flow)
  if (tokenHash && type === 'recovery') {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });

    if (error) {
      logger.error('Recovery token verification failed', {
        errorMessage: error.message,
        errorCode: error.code,
      });
      return NextResponse.redirect(`${requestUrl.origin}/reset-password?error=invalid_token`);
    }

    return NextResponse.redirect(`${requestUrl.origin}/reset-password`);
  }

  if (code) {
    const supabase = await createClient();

    const {
      data: { session },
      error,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.error('OAuth callback - exchangeCodeForSession failed', {
        errorMessage: error.message,
        errorCode: error.code,
        errorStatus: error.status,
        origin: requestUrl.origin,
        hasCode: !!code,
      });
      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=oauth_failed&reason=${encodeURIComponent(error.message)}`,
      );
    }

    // Password recovery flow - redirect to reset page
    if (type === 'recovery' && session) {
      return NextResponse.redirect(`${requestUrl.origin}/reset-password`);
    }

    if (session?.user) {
      // Check if user already has a tenant (existing user login)
      const { data: existingAdmin } = await supabase
        .from('admin_users')
        .select('id, tenant_id, is_super_admin, role, tenants(slug, onboarding_completed)')
        .eq('user_id', session.user.id)
        .single();

      if (existingAdmin) {
        // Track login: update last_login_at, increment login_count, create session
        try {
          const userAgent = request.headers.get('user-agent') || '';
          const forwardedFor = request.headers.get('x-forwarded-for');
          const ipAddress = forwardedFor?.split(',')[0]?.trim() || 'unknown';

          await Promise.all([
            supabase.rpc('increment_login_count', { admin_user_id: existingAdmin.id }),
            supabase.from('user_sessions').insert({
              user_id: existingAdmin.id,
              tenant_id: existingAdmin.tenant_id,
              login_type: 'web',
              ip_address: ipAddress,
              user_agent: userAgent,
            }),
          ]);
        } catch (loginTrackError) {
          logger.warn('Failed to track login', { error: String(loginTrackError) });
        }

        // Supabase join type gap
        const tenantsData = existingAdmin.tenants as unknown as {
          slug: string;
          onboarding_completed: boolean;
        } | null;

        // Check if onboarding is pending
        if (tenantsData?.onboarding_completed === false) {
          return NextResponse.redirect(`${requestUrl.origin}/onboarding`);
        }

        // All authenticated users land on the tenant hub
        return NextResponse.redirect(`${requestUrl.origin}/admin/tenants`);
      }

      // User has no tenant - create one directly in-process.
      // The session was just established via exchangeCodeForSession, so we trust
      // session.user here. A loopback fetch to /api/signup-oauth cannot work: it
      // forwards no Origin/Referer (CSRF 403) and no auth cookies (getUser 401).
      // Restrict plan to known values; query params are attacker-controllable.
      const signupPlan = plan === 'pro' || plan === 'business' ? plan : 'starter';
      const signupName = (restaurantName || 'Mon Etablissement').slice(0, 100);

      try {
        const adminSupabase = createAdminClient();
        const signupService = createSignupService(adminSupabase);

        const result = await signupService.completeOAuthSignup({
          userId: session.user.id,
          email: session.user.email ?? '',
          restaurantName: signupName,
          plan: signupPlan,
        });

        // A/B test: shorten trial to 7d if the visitor was assigned that variant
        // (parity with the former /api/signup-oauth route).
        const trialVariant = parseAbTrialFromCookieHeader(request.headers.get('cookie') ?? '');
        if (trialVariant === '7d') {
          const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
          const { error: trialErr } = await adminSupabase
            .from('tenants')
            .update({ trial_ends_at: trialEndsAt })
            .eq('id', result.tenantId);
          if (trialErr) {
            logger.warn('AB test: failed to apply 7d trial', { tenantId: result.tenantId });
          }
        }

        return NextResponse.redirect(`${requestUrl.origin}/onboarding`);
      } catch (signupError) {
        const message =
          signupError instanceof ServiceError ? signupError.message : 'Erreur creation compte';
        // Duplicate/existing-user case: log softly, otherwise treat as a real error.
        if (message.includes('already') || message.includes('existe')) {
          logger.warn('OAuth user exists but has no tenant - redirecting to signup', {
            userId: session.user.id,
            emailHash: session.user.email ? hashEmail(session.user.email) : undefined,
          });
        } else {
          logger.error('OAuth signup failed', { error: message });
        }
        return NextResponse.redirect(
          `${requestUrl.origin}/signup?error=${encodeURIComponent(message)}&email=${encodeURIComponent(session.user.email || '')}`,
        );
      }
    }
  }

  // Default redirect to login
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
