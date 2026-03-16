import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import type { CookieOptions } from '@supabase/ssr';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const plan = requestUrl.searchParams.get('plan');
  const restaurantName = requestUrl.searchParams.get('restaurant_name');

  // Accumulate cookies to apply to the final redirect response
  const cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_APP_DOMAIN) {
            options.domain = `.${process.env.NEXT_PUBLIC_APP_DOMAIN}`;
            options.sameSite = 'lax';
          }
          cookiesToSet.push({ name, value, options });
        },
        remove(name: string, options: CookieOptions) {
          cookiesToSet.push({ name, value: '', options: { ...options, maxAge: 0 } });
        },
      },
    },
  );

  // Helper: create redirect response with accumulated cookies
  function redirectWithCookies(url: string): NextResponse {
    const response = NextResponse.redirect(url);
    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set({ name, value, ...options });
    }
    return response;
  }

  // Handle token_hash-based recovery (custom password reset email flow)
  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });

    if (error) {
      logger.error('Recovery token verification failed', {
        errorMessage: error.message,
        errorCode: error.code,
      });
      return redirectWithCookies(`${requestUrl.origin}/reset-password?error=invalid_token`);
    }

    return redirectWithCookies(`${requestUrl.origin}/reset-password`);
  }

  if (code) {
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
      return redirectWithCookies(
        `${requestUrl.origin}/login?error=oauth_failed&reason=${encodeURIComponent(error.message)}`,
      );
    }

    // Password recovery flow
    if (type === 'recovery' && session) {
      return redirectWithCookies(`${requestUrl.origin}/reset-password`);
    }

    if (session?.user) {
      // Check if user already has a tenant (existing user login)
      const { data: existingAdmin } = await supabase
        .from('admin_users')
        .select('id, tenant_id, is_super_admin, role, tenants(slug, onboarding_completed)')
        .eq('user_id', session.user.id)
        .single();

      if (existingAdmin) {
        // Track login
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

        const tenantsData = existingAdmin.tenants as unknown as {
          slug: string;
          onboarding_completed: boolean;
        } | null;

        // Check if onboarding is pending
        if (tenantsData?.onboarding_completed === false) {
          return redirectWithCookies(`${requestUrl.origin}/onboarding`);
        }

        // All authenticated users land on the tenant hub
        return redirectWithCookies(`${requestUrl.origin}/admin/tenants`);
      }

      // User has no tenant - need to create one via OAuth signup
      const signupPlan = plan || 'essentiel';
      const signupName = restaurantName || 'Mon activité';

      // Call signup API to create tenant
      const signupResponse = await fetch(`${requestUrl.origin}/api/signup-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session.user.id,
          email: session.user.email,
          restaurantName: signupName,
          plan: signupPlan,
        }),
      });

      const signupData = await signupResponse.json();

      if (signupResponse.ok && signupData.slug) {
        return redirectWithCookies(`${requestUrl.origin}/onboarding`);
      } else {
        if (signupData.error?.includes('already') || signupData.error?.includes('existe')) {
          logger.warn('OAuth user exists but has no tenant - redirecting to signup', {
            userId: session.user.id,
            email: session.user.email,
          });
        } else {
          logger.error('Signup OAuth API error', { error: signupData.error });
        }
        return redirectWithCookies(
          `${requestUrl.origin}/signup?error=${encodeURIComponent(signupData.error || 'Erreur lors de la creation du compte')}&email=${encodeURIComponent(session.user.email || '')}`,
        );
      }
    }
  }

  // Default redirect to login
  return redirectWithCookies(`${requestUrl.origin}/login`);
}
