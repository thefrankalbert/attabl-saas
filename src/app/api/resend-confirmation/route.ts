import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { resendConfirmationSchema } from '@/lib/validations/auth.schema';
import { resendConfirmationLimiter, getClientIp } from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { sendWelcomeConfirmationEmail } from '@/services/email.service';

/**
 * POST /api/resend-confirmation
 *
 * Re-sends the confirmation email for an unconfirmed account.
 * Rate-limited to 3 requests per 10 minutes per IP.
 *
 * Returns success for unknown/confirmed emails (prevent enumeration).
 * Returns 500 if link generation actually fails (so the client can show an error).
 */
export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await resendConfirmationLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
        { status: 429, headers: { 'Retry-After': '120' } },
      );
    }

    // 2. Parse and validate
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    const parseResult = resendConfirmationSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
    }

    const { email } = parseResult.data;
    const supabase = createAdminClient();

    const SAFE_MSG =
      'Si un compte existe avec cet email, un nouveau lien de confirmation a ete envoye.';

    // 3. Generate a fresh confirmation link directly (O(1), no listUsers pagination issues).
    //    generateLink({ type: 'signup' }) will fail if the user doesn't exist or is
    //    already confirmed, which we handle as a silent success (anti-enumeration).
    // password is required by TS types for type:'signup' but the Supabase API
    // accepts an empty string for existing users (it won't update their password).
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      password: '',
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      // User doesn't exist or is already confirmed -- return success to prevent enumeration.
      // Only log at error level if it looks like a genuine server error (not a "user not found" case).
      const errorMsg = linkError?.message ?? '';
      if (
        errorMsg.includes('already') ||
        errorMsg.includes('not found') ||
        errorMsg.includes('confirmed')
      ) {
        logger.info('Resend confirmation: user not found or already confirmed', { email });
        return NextResponse.json({ success: true, message: SAFE_MSG });
      }
      logger.error('Failed to generate confirmation link for resend', { error: linkError });
      return NextResponse.json(
        { error: 'Impossible de generer le lien de confirmation. Reessayez plus tard.' },
        { status: 500 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
    const confirmationUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=signup`;

    await sendWelcomeConfirmationEmail(email, { confirmationUrl });

    return NextResponse.json({ success: true, message: SAFE_MSG });
  } catch (error) {
    logger.error('Resend confirmation error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
