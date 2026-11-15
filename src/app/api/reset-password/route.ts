import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { verifyOrigin } from '@/lib/csrf';
import { forgotPasswordAdresseLimiter, getClientIp } from '@/lib/rate-limit';
import { resetPasswordSubmitSchema } from '@/lib/validations/auth.schema';
import { recoveryEmailMatches } from '@/lib/auth/recovery-email';
import { RECOVERY_MARKER_COOKIE, verifyRecoveryMarker } from '@/lib/auth/recovery-marker';

/**
 * POST /api/reset-password (A-06)
 *
 * Le changement de mot de passe de la page de reinitialisation passe par le
 * serveur, qui exige TROIS choses que le navigateur seul ne peut pas garantir:
 *  1. une session authentifiee (`getUser()`, jamais `getSession()`);
 *  2. le marqueur de session de recuperation, pose par /auth/callback apres la
 *     verification d'un jeton de recuperation: une session ordinaire ne suffit pas;
 *  3. l'adresse du compte, retapee par la personne. Si elle ne correspond pas, le
 *     lien n'etait pas le sien (lien d'un autre compte envoye a une victime): on
 *     deconnecte localement et on ne change rien.
 *
 * Codes de refus: NO_RECOVERY (401/403), EMAIL_MISMATCH (403), SAME_PASSWORD (400).
 */
export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const { success: allowed } = await forgotPasswordAdresseLimiter.check(
      `reset-submit:${getClientIp(request)}`,
    );
    if (!allowed) {
      return NextResponse.json({ code: 'RATE_LIMITED' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ code: 'INVALID' }, { status: 400 });
    }
    const parsed = resetPasswordSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'INVALID', error: parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ code: 'NO_RECOVERY' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const marker = cookieStore.get(RECOVERY_MARKER_COOKIE)?.value;
    if (!marker || verifyRecoveryMarker(marker) !== user.id) {
      return NextResponse.json({ code: 'NO_RECOVERY' }, { status: 403 });
    }

    if (!recoveryEmailMatches(parsed.data.accountEmail, user.email)) {
      await supabase.auth.signOut({ scope: 'local' });
      cookieStore.delete(RECOVERY_MARKER_COOKIE);
      return NextResponse.json({ code: 'EMAIL_MISMATCH' }, { status: 403 });
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    if (updateError) {
      const code = (updateError as { code?: string }).code;
      logger.error('Password update failed', { error: updateError.message, code });
      if (code === 'same_password') {
        return NextResponse.json({ code: 'SAME_PASSWORD' }, { status: 400 });
      }
      return NextResponse.json({ code: 'GENERIC' }, { status: 500 });
    }

    cookieStore.delete(RECOVERY_MARKER_COOKIE);
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Reset password error', err);
    return NextResponse.json({ code: 'GENERIC' }, { status: 500 });
  }
}
