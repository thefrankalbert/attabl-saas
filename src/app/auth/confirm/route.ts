import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { sendWelcomeOnboardingEmail } from '@/services/email.service';
import { verifyEmailChangeToken } from '@/lib/auth/email-change-token';

/**
 * Confirmation d'un changement d'adresse demande par un administrateur (A-09).
 * Le clic prouve que la NOUVELLE adresse recoit le courrier. Aucune session
 * n'est ouverte: le client service_role n'en persiste aucune.
 */
async function confirmEmailChange(requestUrl: URL, token: string | null): Promise<NextResponse> {
  const claims = token ? verifyEmailChangeToken(token) : null;
  if (!claims) {
    logger.warn('Email change confirmation refused: invalid or expired token');
    return NextResponse.redirect(`${requestUrl.origin}/login?error=expired_link`);
  }

  try {
    const supabase = createAdminClient();

    // Le jeton est lie a l'adresse ACTUELLE: si elle a change depuis, ce lien
    // est perime (c'est ce qui le rend a usage unique).
    const { data: current, error: lookupError } = await supabase.auth.admin.getUserById(
      claims.userId,
    );
    if (lookupError || current?.user?.email?.toLowerCase() !== claims.fromEmail) {
      logger.warn('Email change confirmation refused: account email changed or not found');
      return NextResponse.redirect(`${requestUrl.origin}/login?error=expired_link`);
    }

    // email_confirm: la nouvelle adresse vient de prouver qu'elle recoit le courrier.
    const { error: updateError } = await supabase.auth.admin.updateUserById(claims.userId, {
      email: claims.toEmail,
      email_confirm: true,
    });
    if (updateError) {
      logger.error('Email change confirmation failed', { error: updateError.message });
      return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_failed`);
    }

    // Miroir applicatif: les lignes admin_users de CE compte auth (la garde de
    // perimetre a deja exige qu'il n'en ait que dans le tenant demandeur).
    const { error: mirrorError } = await supabase
      .from('admin_users')
      .update({ email: claims.toEmail })
      .eq('user_id', claims.userId);
    if (mirrorError) {
      logger.error('Email change: admin_users mirror not updated', { error: mirrorError.message });
    }

    return NextResponse.redirect(`${requestUrl.origin}/login?confirmed=true`);
  } catch (err) {
    logger.error('Unexpected error during email change confirmation', err);
    return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_failed`);
  }
}

/**
 * GET /auth/confirm?token_hash=...&type=signup
 *
 * Handles email confirmation links sent via Resend.
 * Verifies the OTP token, confirms the user, sends welcome email,
 * then redirects to login.
 *
 * GET /auth/confirm?token=...&type=email_change: voir confirmEmailChange.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');

  if (type === 'email_change') {
    return confirmEmailChange(requestUrl, requestUrl.searchParams.get('token'));
  }

  if (!tokenHash || type !== 'signup') {
    logger.warn('Invalid confirmation link parameters', { tokenHash: !!tokenHash, type });
    return NextResponse.redirect(`${requestUrl.origin}/login?error=invalid_token`);
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

      // La page de connexion n'affiche que des CODES qu'elle connait (elle ne
      // recopie jamais un texte venu de l'adresse). Ce fichier envoyait des
      // phrases: aucune ne correspondait a un code, donc un lien expire
      // affichait "Une erreur est survenue" - sans dire que le lien etait
      // perime ni comment en obtenir un autre (audit 2026-11-10, C-038).
      const isExpired = error.message.includes('expired') || error.message.includes('invalid');

      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=${isExpired ? 'expired_link' : 'auth_failed'}`,
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
          .select('tenant_id')
          .eq('user_id', userId)
          // A user can own several tenants; `.single()` would throw. Take the most recent.
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (adminUser) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('slug')
            .eq('id', adminUser.tenant_id)
            .single();

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
          const dashboardUrl = tenant ? `${appUrl}/sites/${tenant.slug}/admin` : `${appUrl}/login`;

          await sendWelcomeOnboardingEmail(userEmail, { dashboardUrl });
        }
      }
    } catch (emailErr) {
      // Welcome email is best-effort - never block the confirmation flow
      logger.error('Failed to send welcome onboarding email after confirmation', emailErr);
    }

    // Email confirmed successfully - redirect to login with success message
    return NextResponse.redirect(`${requestUrl.origin}/login?confirmed=true`);
  } catch (err) {
    logger.error('Unexpected error during email confirmation', err);
    return NextResponse.redirect(`${requestUrl.origin}/login?error=auth_failed`);
  }
}
