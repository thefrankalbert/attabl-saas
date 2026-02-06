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
                .select('tenant_id, tenants(slug)')
                .eq('user_id', session.user.id)
                .single();

            if (existingAdmin) {
                // Existing user - redirect to their dashboard
                const tenantsData = existingAdmin.tenants as unknown;
                let tenantSlug: string | undefined;

                if (Array.isArray(tenantsData) && tenantsData.length > 0) {
                    tenantSlug = (tenantsData[0] as { slug: string }).slug;
                } else if (tenantsData && typeof tenantsData === 'object') {
                    tenantSlug = (tenantsData as { slug: string }).slug;
                }

                if (tenantSlug) {
                    const isDev = requestUrl.hostname === 'localhost';
                    if (isDev) {
                        return NextResponse.redirect(`http://${tenantSlug}.localhost:3000/admin`);
                    } else {
                        return NextResponse.redirect(`https://${tenantSlug}.attabl.com/admin`);
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
                    const isDev = requestUrl.hostname === 'localhost';
                    if (isDev) {
                        return NextResponse.redirect(`http://${signupData.slug}.localhost:3000/admin`);
                    } else {
                        return NextResponse.redirect(`https://${signupData.slug}.attabl.com/admin`);
                    }
                }
            }

            // No tenant and no signup data - redirect to signup to complete
            return NextResponse.redirect(`${requestUrl.origin}/signup?oauth=incomplete`);
        }
    }

    // Default redirect to login
    return NextResponse.redirect(`${requestUrl.origin}/login`);
}
