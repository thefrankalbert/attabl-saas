import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { resendConfirmationSchema } from '@/lib/validations/auth.schema';
import { resendConfirmationLimiter, getClientIp } from '@/lib/rate-limit';
import { sendWelcomeConfirmationEmail } from '@/services/email.service';

/**
 * POST /api/resend-confirmation
 *
 * Re-sends the confirmation email for an unconfirmed account.
 * Rate-limited to 3 requests per 10 minutes per IP.
 *
 * For security, always returns success (even if the email doesn't exist)
 * to prevent email enumeration.
 */
export async function POST(request: Request) {
  try {
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

    // 3. Look up user and generate new confirmation link
    const supabase = createAdminClient();

    // Find the user by email
    const { data: userList } = await supabase.auth.admin.listUsers();
    const user = userList?.users?.find((u) => u.email === email);

    if (!user) {
      // Don't reveal whether the email exists — return success anyway
      logger.info('Resend confirmation requested for unknown email', { email });
      return NextResponse.json({
        success: true,
        message:
          'Si un compte existe avec cet email, un nouveau lien de confirmation a été envoyé.',
      });
    }

    // If user is already confirmed, no need to resend
    if (user.email_confirmed_at) {
      logger.info('Resend confirmation requested for already-confirmed email', { email });
      return NextResponse.json({
        success: true,
        message:
          'Si un compte existe avec cet email, un nouveau lien de confirmation a été envoyé.',
      });
    }

    // Generate a new confirmation link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      password: '', // Not needed for generating a link for an existing user
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      logger.error('Failed to generate confirmation link for resend', { error: linkError });
      // Still return success to prevent enumeration
      return NextResponse.json({
        success: true,
        message:
          'Si un compte existe avec cet email, un nouveau lien de confirmation a été envoyé.',
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
    const confirmationUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=signup`;

    await sendWelcomeConfirmationEmail(email, {
      confirmationUrl,
    });

    return NextResponse.json({
      success: true,
      message: 'Si un compte existe avec cet email, un nouveau lien de confirmation a été envoyé.',
    });
  } catch (error) {
    logger.error('Resend confirmation error', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
