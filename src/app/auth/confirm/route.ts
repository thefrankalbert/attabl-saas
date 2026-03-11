import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { sendWelcomeOnboardingEmail } from '@/services/email.service';

/**
 * GET /auth/confirm?token_hash=...&type=signup
 *
 * Handles email confirmation links sent via Resend.
 * Verifies the OTP token, confirms the user, sends welcome email,
 * then redirects to login.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');

  if (!tokenHash || type !== 'signup') {
    logger.warn('Invalid confirmation link parameters', { tokenHash: !!tokenHash, type });
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent('Lien de confirmation invalide.')}`,
    );
  }

  try {
    const supabase = createAdminClient();

    // Verify the OTP token to confirm the user's email
    const { data: verifyData, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'signup',
    });

    if (error) {
      logger.error('Email confirmation failed', { error: error.message });

      const isExpired = error.message.includes('expired') || error.message.includes('invalid');
      const errorMessage = isExpired
        ? 'Le lien de confirmation a expiré. Veuillez vous reconnecter pour recevoir un nouveau lien.'
        : 'Erreur lors de la confirmation. Veuillez réessayer.';

      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=${encodeURIComponent(errorMessage)}`,
      );
    }

    // --- Send welcome onboarding email (best-effort, non-blocking) ---
    try {
      const userId = verifyData?.user?.id;
      const userEmail = verifyData?.user?.email;

      if (userId && userEmail) {
        // Get restaurant name from admin_users
        const { data: adminUser } = await supabase
          .from('admin_users')
          .select('full_name, tenant_id')
          .eq('user_id', userId)
          .single();

        if (adminUser) {
          // Get tenant slug for dashboard URL
          const { data: tenant } = await supabase
            .from('tenants')
            .select('slug')
            .eq('id', adminUser.tenant_id)
            .single();

          // Count total restaurants for social proof
          const { count } = await supabase
            .from('tenants')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true);

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
          const dashboardUrl = tenant ? `${appUrl}/sites/${tenant.slug}/admin` : `${appUrl}/login`;

          await sendWelcomeOnboardingEmail(userEmail, {
            restaurantName: adminUser.full_name,
            dashboardUrl,
            totalRestaurants: count || 0,
          });
        }
      }
    } catch (emailErr) {
      // Welcome email is best-effort — never block the confirmation flow
      logger.error('Failed to send welcome onboarding email after confirmation', emailErr);
    }

    // Email confirmed successfully — redirect to login with success message
    return NextResponse.redirect(`${requestUrl.origin}/login?confirmed=true`);
  } catch (err) {
    logger.error('Unexpected error during email confirmation', err);
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent('Erreur serveur. Veuillez réessayer.')}`,
    );
  }
}
