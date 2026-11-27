import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { hashEmail } from '@/lib/hash-email';
import { createSignupService } from '@/services/signup.service';
import { ServiceError } from '@/services/errors';
import { pickOnboardingTenantIndex } from '@/lib/onboarding/select-onboarding-tenant';
import { mapMembershipRows, postLoginDestination } from '@/lib/auth/post-login-destination';
import {
  APPAREIL_CONNU_COOKIE,
  cookieAppareilDeLaRequete,
  optionsCookieAppareil,
} from '@/lib/auth/appareil-connu';
import { traiterConnexionReussie } from '@/lib/auth/alerte-nouvelle-connexion';
import { hasVerifiedFactor } from '@/lib/auth/mfa-assurance';
import {
  RECOVERY_MARKER_COOKIE,
  RECOVERY_MARKER_TTL_SECONDS,
  signRecoveryMarker,
} from '@/lib/auth/recovery-marker';

/**
 * Redirection vers la page de reinitialisation, avec le marqueur de session de
 * recuperation (A-06): cookie httpOnly signe, lie au compte du lien. Sans lui, le
 * serveur refuse de changer le mot de passe depuis la page.
 */
function redirectToResetPassword(origin: string, userId: string | undefined): NextResponse {
  const response = NextResponse.redirect(`${origin}/reset-password`);
  if (userId) {
    try {
      response.cookies.set(RECOVERY_MARKER_COOKIE, signRecoveryMarker(userId), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: RECOVERY_MARKER_TTL_SECONDS,
      });
    } catch (err) {
      logger.error('Recovery marker not set', { error: String(err) });
    }
  }
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');

  // Handle token_hash-based recovery (custom password reset email flow)
  if (tokenHash && type === 'recovery') {
    const supabase = await createClient();
    const { data: recoveryData, error } = await supabase.auth.verifyOtp({
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

    return redirectToResetPassword(requestUrl.origin, recoveryData?.user?.id);
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
      // B66: le message brut de GoTrue reste au journal, jamais dans l'URL.
      return NextResponse.redirect(`${requestUrl.origin}/login?error=oauth_failed`);
    }

    // No recovery branch here on purpose: every reset link the app sends uses
    // token_hash (handled above, the token type is checked by Supabase). A
    // `?type=recovery` added by hand to an OAuth/PKCE URL must not hand out the
    // recovery marker (CodeQL js/user-controlled-bypass, 2026-11-20).
    if (session?.user) {
      // Check if user already has a tenant (existing user login). Fetch ALL rows:
      // a multi-tenant owner has several, and .single() would error -> wrongly fall
      // through to the new-user branch and create a duplicate tenant.
      const { data: existingAdminRows, error: adminRowsError } = await supabase
        .from('admin_users')
        .select(
          'id, tenant_id, is_super_admin, role, is_active, deleted_at, tenants(slug, onboarding_completed, created_at, deleted_at)',
        )
        .eq('user_id', session.user.id);

      // A transient DB error must NOT fall through to the new-user branch below:
      // that would create a duplicate tenant for an existing user.
      if (adminRowsError) {
        logger.error('OAuth callback - failed to fetch admin_users', {
          userId: session.user.id,
          errorMessage: adminRowsError.message,
          errorCode: adminRowsError.code,
        });
        return NextResponse.redirect(
          `${requestUrl.origin}/login?error=oauth_failed&reason=db_error`,
        );
      }

      if (existingAdminRows && existingAdminRows.length > 0) {
        // Deterministic pick for login tracking: most recent unfinished tenant.
        const pickIndex = pickOnboardingTenantIndex(
          existingAdminRows.map((row) => {
            const t = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
            return {
              onboardingCompleted: !!(t as { onboarding_completed?: boolean } | null)
                ?.onboarding_completed,
              createdAt: (t as { created_at?: string } | null)?.created_at ?? null,
            };
          }),
        );
        const existingAdmin = existingAdminRows[pickIndex];

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

        // Meme regle de destination que la connexion par mot de passe (voir
        // `postLoginDestination`): super-admin plateforme -> console, owner ->
        // annuaire de ses etablissements (ou reprise d'onboarding), tout autre
        // role -> l'espace de son etablissement. Avant, cette branche envoyait
        // TOUT LE MONDE sur `/admin/tenants`, qui refuse les non-proprietaires.
        //
        // Double authentification (audit K6.13): un compte avec facteur verifie
        // sort de l'echange OAuth en session aal1 et passe d'abord par
        // /auth/mfa, qui garde la destination dans `next`.
        const destination = postLoginDestination(mapMembershipRows(existingAdminRows));
        const response = NextResponse.redirect(
          hasVerifiedFactor(session.user)
            ? `${requestUrl.origin}/auth/mfa?next=${encodeURIComponent(destination)}`
            : `${requestUrl.origin}${destination}`,
        );

        // Alerte "nouvelle connexion" si l'appareil est inconnu (audit Q19).
        // Meilleur effort: ne leve jamais, l'e-mail part apres la reponse.
        const provider = session.user.app_metadata?.provider;
        const cookieAppareil = await traiterConnexionReussie({
          supabase,
          userId: session.user.id,
          email: session.user.email,
          compteCreeLe: session.user.created_at,
          cookieAppareil: cookieAppareilDeLaRequete(request),
          methode: provider === 'google' ? 'google' : 'autre',
        });
        if (cookieAppareil) {
          response.cookies.set(APPAREIL_CONNU_COOKIE, cookieAppareil, optionsCookieAppareil());
        }
        return response;
      }

      // User has no tenant - create one directly in-process.
      // The session was just established via exchangeCodeForSession, so we trust
      // session.user here. A loopback fetch to an API route (the former
      // /api/signup-oauth, now removed) cannot work: it forwards no
      // Origin/Referer (CSRF 403) and no auth cookies (getUser 401).
      // B18: aucun lien n'envoie `plan` ni `restaurant_name` (useAuthForm ne
      // passe que /auth/callback): l'inscription Google part toujours de la
      // formule de depart et d'un nom provisoire, modifie a l'onboarding.
      const signupPlan = 'starter';
      const signupName = 'Mon Établissement';

      try {
        const adminSupabase = createAdminClient();
        const signupService = createSignupService(adminSupabase);

        await signupService.completeOAuthSignup({
          userId: session.user.id,
          email: session.user.email ?? '',
          restaurantName: signupName,
          plan: signupPlan,
        });

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
        // B17: /signup n'affiche aucun bandeau d'erreur venu de l'URL (ni une
        // phrase libre): l'echec restait muet. /login affiche `oauth_failed`.
        return NextResponse.redirect(`${requestUrl.origin}/login?error=oauth_failed`);
      }
    }
  }

  // Default redirect to login
  return NextResponse.redirect(`${requestUrl.origin}/login`);
}
