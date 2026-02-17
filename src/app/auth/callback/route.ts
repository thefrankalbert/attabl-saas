import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const plan = requestUrl.searchParams.get('plan');
  const restaurantName = requestUrl.searchParams.get('restaurant_name');

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

        // Check if user is Super Admin
        const isSuperAdmin =
          existingAdmin.is_super_admin === true || existingAdmin.role === 'super_admin';

        // Super Admin: redirect to tenant selector
        if (isSuperAdmin) {
          return NextResponse.redirect(`${requestUrl.origin}/admin/tenants`);
        }

        const tenantsData = existingAdmin.tenants as unknown as {
          slug: string;
          onboarding_completed: boolean;
        } | null;

        if (tenantsData?.slug) {
          // Check if onboarding is completed
          if (tenantsData.onboarding_completed === false) {
            return NextResponse.redirect(`${requestUrl.origin}/onboarding`);
          }

          // Existing user with completed onboarding - redirect to dashboard
          return NextResponse.redirect(`${requestUrl.origin}/sites/${tenantsData.slug}/admin`);
        }
      }

      // User has no tenant — need to create one via OAuth signup
      // Use provided plan/restaurantName or defaults
      const signupPlan = plan || 'essentiel';
      const signupName = restaurantName || 'Mon Établissement';

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
        return NextResponse.redirect(`${requestUrl.origin}/onboarding`);
      } else {
        // If user already exists error (duplicate), try to find their tenant again
        if (signupData.error?.includes('already') || signupData.error?.includes('existe')) {
          logger.warn('OAuth user exists but has no tenant — redirecting to signup', {
            userId: session.user.id,
            email: session.user.email,
          });
        } else {
          logger.error('Signup OAuth API error', { error: signupData.error });
        }
        return NextResponse.redirect(
          `${requestUrl.origin}/signup?error=${encodeURIComponent(signupData.error || 'Erreur création compte')}&email=${encodeURIComponent(session.user.email || '')}`,
        );
      }
    }
  }

  // Default redirect to login
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
