import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * GET /auth/confirm?token_hash=...&type=signup
 *
 * Handles email confirmation links sent via Resend.
 * Verifies the OTP token, confirms the user, then redirects to login.
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
    const { error } = await supabase.auth.verifyOtp({
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

    // Email confirmed successfully — redirect to login with success message
    return NextResponse.redirect(`${requestUrl.origin}/login?confirmed=true`);
  } catch (err) {
    logger.error('Unexpected error during email confirmation', err);
    return NextResponse.redirect(
      `${requestUrl.origin}/login?error=${encodeURIComponent('Erreur serveur. Veuillez réessayer.')}`,
    );
  }
}
