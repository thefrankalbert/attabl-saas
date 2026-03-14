import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { resendConfirmationSchema } from '@/lib/validations/auth.schema';
import { resendConfirmationLimiter, getClientIp } from '@/lib/rate-limit';
import { sendWelcomeConfirmationEmail } from '@/services/email.service';
import type { GenerateLinkParams } from '@supabase/auth-js';

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
      'Si un compte existe avec cet email, un nouveau lien de confirmation a été envoyé.';

    // 3. Find user by email
    const { data: userList } = await supabase.auth.admin.listUsers();
    const user = userList?.users?.find((u) => u.email === email);

    if (!user) {
      logger.info('Resend confirmation requested for unknown email', { email });
      return NextResponse.json({ success: true, message: SAFE_MSG });
    }

    // Already confirmed — no need to resend
    if (user.email_confirmed_at) {
      logger.info('Resend confirmation requested for already-confirmed email', { email });
      return NextResponse.json({ success: true, message: SAFE_MSG });
    }

    // 4. Generate a fresh confirmation link using type: 'signup'
    //    (consistent with /auth/confirm which expects type=signup)
    //    Omit password to avoid empty-password mismatch — the API accepts it
    //    for existing users even though the TS types mark it as required.
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
    } as GenerateLinkParams);

    if (linkError || !linkData?.properties?.hashed_token) {
      logger.error('Failed to generate confirmation link for resend', { error: linkError });
      return NextResponse.json(
        { error: 'Impossible de générer le lien de confirmation. Réessayez plus tard.' },
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
