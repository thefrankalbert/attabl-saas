import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { forgotPasswordSchema } from '@/lib/validations/auth.schema';
import { forgotPasswordLimiter, getClientIp } from '@/lib/rate-limit';
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

    const successResponse = NextResponse.json({
      success: true,
      message: 'Si un compte existe avec cet email, vous recevrez un lien de reinitialisation.',
    });

    // 3. Generate recovery link via admin API
    const supabase = createAdminClient();

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      // Log the error but return success to prevent enumeration
      logger.info('Forgot password: generateLink failed or user not found', {
        email,
        error: linkError?.message,
      });
      return successResponse;
    }

    // 4. Build the recovery URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
    const resetUrl = `${appUrl}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=recovery`;

    // 5. Send custom branded email via Resend
    await sendPasswordResetEmail(email, { resetUrl });

    return successResponse;
  } catch (error) {
    logger.error('Forgot password error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
