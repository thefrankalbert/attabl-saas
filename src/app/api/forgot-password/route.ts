import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger, hashEmail } from '@/lib/logger';
import { forgotPasswordSchema } from '@/lib/validations/auth.schema';
import { forgotPasswordLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { sendPasswordResetEmail } from '@/services/email.service';

/**
 * POST /api/forgot-password
 *
 * Generates a password recovery link via the Supabase admin API
 * and sends a custom branded email via Resend.
 *
 * Rate-limited to 3 requests per 10 minutes per IP.
 * Always returns success to prevent email enumeration.
 */
export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await forgotPasswordLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requetes. Reessayez dans quelques minutes.' },
        { status: 429, headers: { 'Retry-After': '120' } },
      );
    }

    // 2. Parse and validate
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requete invalide' }, { status: 400 });
    }

    const parseResult = forgotPasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    const { email } = parseResult.data;

    // Design decision: Always return 200 to prevent email enumeration.
    // Email sending failures are logged (see logger.warn calls below) and
    // should be monitored via Sentry/log aggregation for operational awareness.
    const successResponse = NextResponse.json({
      success: true,
      message: 'Si un compte existe avec cet email, vous recevrez un lien de reinitialisation.',
    });

    // 3. Generate recovery link via admin API (O(1) lookup, no listUsers pagination issues)
    //    Security note: generateLink('recovery') will fail for unconfirmed emails,
    //    which is handled below by sending a confirmation link instead.
    //    This prevents password reset for accounts that haven't verified their email.
    const supabase = createAdminClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      // No fallback to type:'signup' with an empty password - that path would
      // silently create a user when the email did not exist (ghost user
      // creation via forgot-password enumeration). Unverified users who hit
      // this endpoint will simply not receive an email; they can re-request
      // signup confirmation through the /signup flow instead.
      logger.info('Forgot password: recovery link generation failed', {
        emailHash: hashEmail(email),
        error: linkError?.message,
      });
      return successResponse;
    }

    // 4. Build the recovery URL
    const resetUrl = `${appUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery`;

    // 5. Send custom branded email via Resend
    const emailSent = await sendPasswordResetEmail(email, { resetUrl });
    if (!emailSent) {
      logger.warn('Password reset email failed to send', { emailHash: hashEmail(email) });
    }

    return successResponse;
  } catch (error) {
    logger.error('Forgot password error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
