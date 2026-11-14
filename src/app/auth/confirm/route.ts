import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { sendWelcomeOnboardingEmail } from '@/services/email.service';
import { verifyEmailChangeToken } from '@/lib/auth/email-change-token';
import { createEmailChangeService } from '@/services/email-change.service';
import { adminPasswordResetLinkLimiter } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';

/**
 * POST /auth/confirm (champ `token`, A-09): une etape du changement d'adresse.
 *
 * Un POST et non un GET: un scanner de courriel ou un apercu de lien ouvre les
 * liens en GET sans que la personne ait decide quoi que ce soit. La page
 * /auth/confirm-email-change affiche le bouton "Confirmer" qui poste ici.
 * Aucune session n'est ouverte: le client service_role n'en persiste aucune.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const redirect = (path: string) => NextResponse.redirect(`${origin}${path}`, 303);

  const originErr = verifyOrigin(request);
  if (originErr) return originErr;

  try {
    const form = await request.formData();
    const token = form.get('token');
    // verifyEmailChangeToken peut lever si le secret serveur manque: dans le try,
    // la personne voit une page d'erreur propre et non un 500.
    const claims = typeof token === 'string' ? verifyEmailChangeToken(token) : null;
    if (!claims) {
      logger.warn('Email change confirmation refused: invalid or expired token');
      return redirect('/login?error=expired_link');
    }

    // L'etape `current` envoie un courriel: bornee par compte pour qu'un lien
    // rejoue ne serve pas a arroser la nouvelle adresse.
    if (claims.step === 'current') {
      const { success } = await adminPasswordResetLinkLimiter.check(
        `email-change-step:${claims.userId}`,
      );
      if (!success) return redirect('/login?error=auth_failed');
    }

    const outcome = await createEmailChangeService(createAdminClient()).confirmStep(claims);
    switch (outcome) {
      case 'applied':
        return redirect('/login?confirmed=true');
      case 'new_address_notified':
        return redirect('/auth/confirm-email-change?done=current');
      case 'expired':
        return redirect('/login?error=expired_link');
      default:
        return redirect('/login?error=auth_failed');
    }
  } catch (err) {
    logger.error('Unexpected error during email change confirmation', err);
    return redirect('/login?error=auth_failed');
  }
}

/**
 * GET /auth/confirm?token_hash=...&type=signup
 *
 * Handles email confirmation links sent via Resend.
 * Verifies the OTP token, confirms the user, sends welcome email,
 * then redirects to login.
 *
 * Le changement d'adresse (A-09) passe par POST /auth/confirm, voir plus haut.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');

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
