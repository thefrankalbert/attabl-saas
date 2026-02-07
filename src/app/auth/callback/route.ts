import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const plan = requestUrl.searchParams.get('plan');
    const restaurantName = requestUrl.searchParams.get('restaurant_name');

    if (code) {
        const supabase = await createClient();

        const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
            console.error('OAuth callback error:', error);
            return NextResponse.redirect(`${requestUrl.origin}/login?error=oauth_failed`);
        }

        if (session?.user) {
            // Check if user already has a tenant (existing user login)
            const { data: existingAdmin } = await supabase
                .from('admin_users')
                .select('tenant_id, tenants(slug, onboarding_completed)')
                .eq('user_id', session.user.id)
                .single();

            if (existingAdmin) {
                const tenantsData = existingAdmin.tenants as unknown as { slug: string; onboarding_completed: boolean } | null;

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
                        restaurantName: decodeURIComponent(restaurantName),
                        plan,
                    }),
                });

                const signupData = await signupResponse.json();

                if (signupResponse.ok && signupData.slug) {
                    // New signup via OAuth - redirect to onboarding wizard
                    return NextResponse.redirect(`${requestUrl.origin}/onboarding`);
                }
            }

            // No tenant and no signup data - redirect to signup to complete
            return NextResponse.redirect(`${requestUrl.origin}/signup?oauth=incomplete`);
        }
    }

    // Default redirect to login
    return NextResponse.redirect(`${requestUrl.origin}/login`);
}
