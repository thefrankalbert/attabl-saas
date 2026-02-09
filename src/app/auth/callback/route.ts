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
        .select('tenant_id, is_super_admin, role, tenants(slug, onboarding_completed)')
        .eq('user_id', session.user.id)
        .single();

      if (existingAdmin) {
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
          const isDev = requestUrl.hostname === 'localhost';
          if (isDev) {
            return NextResponse.redirect(`http://${tenantsData.slug}.localhost:3000/admin`);
          } else {
            return NextResponse.redirect(`https://${tenantsData.slug}.attabl.com/admin`);
          }
        }
      }

      // New user via OAuth - need to create tenant
      if (plan && restaurantName) {
        // Call signup API to create tenant
        const signupResponse = await fetch(`${requestUrl.origin}/api/signup-oauth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: session.user.id,
            email: session.user.email,
            restaurantName: restaurantName, // Already decoded by searchParams
            plan,
          }),
        });

        const signupData = await signupResponse.json();

        if (signupResponse.ok && signupData.slug) {
          return NextResponse.redirect(`${requestUrl.origin}/onboarding`);
        } else {
          logger.error('Signup OAuth API error', { error: signupData.error });
          return NextResponse.redirect(
            `${requestUrl.origin}/signup?error=${encodeURIComponent(signupData.error || 'Erreur création compte')}`,
          );
        }
      }

      // No tenant and no signup data
      return NextResponse.redirect(`${requestUrl.origin}/signup?error=incomplete_oauth_data`);
    }
  }

  // Default redirect to login
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
