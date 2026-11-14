import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { signupSchema } from '@/lib/validations/auth.schema';
import {
  signupLimiter,
  adminPasswordResetLinkLimiter,
  cleCompte,
  getClientIp,
  getClientIpBrute,
} from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { createSignupService } from '@/services/signup.service';
import { ServiceError, serviceErrorToStatus } from '@/services/errors';
import { getTranslations } from 'next-intl/server';
import { parseAbTrialFromCookieHeader } from '@/lib/ab-testing';
import { HONEYPOT_FIELD, isDevAuthBypassEnabled, isHoneypotTriggered } from '@/lib/honeypot';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { isRestaurantNameTaken } from '@/services/restaurant-name.service';
import { sendSignupAccountExistsEmail } from '@/services/email.service';

/**
 * Corps de reponse unique pour "inscription acceptee". Le meme objet sert au
 * compte cree et a l'adresse deja connue: aucun champ (ni slug, ni tenantId)
 * ne doit pouvoir les distinguer.
 */
function signupAcceptedBody(emailDelivered: boolean, t: (key: string) => string) {
  return {
    success: true,
    requiresConfirmation: true,
    emailDelivered,
    message: t('signupConfirmation'),
  };
}

/**
 * Plafond d'envoi du courriel "vous avez deja un compte", par destinataire. On
 * reutilise le limiteur existant a 3 par heure (aucune fenetre de 24 h n'existe
 * dans rate-limit.ts, fichier protege) avec un prefixe de cle dedie; il echoue
 * ferme (Redis indisponible = pas d'envoi).
 */
async function signupExistsEmailAllowed(email: string): Promise<boolean> {
  const { success } = await adminPasswordResetLinkLimiter.check(
    `signup-exists:${cleCompte(email)}`,
  );
  return success;
}

export async function POST(request: Request) {
  const t = await getTranslations('errors');
  let signupEmail: string | null = null;

  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    // 1. Rate limiting
    const ip = getClientIp(request);
    const { success: allowed } = await signupLimiter.check(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: t('rateLimited') },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    // 2. Parse and validate input with Zod
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t('invalidRequestBody') }, { status: 400 });
    }

    // 2.5 Honeypot check - silent bot rejection (skipped in local dev when bypass enabled)
    if (!isDevAuthBypassEnabled() && isHoneypotTriggered(body)) {
      return NextResponse.json(
        { error: t('invalidDataFallback'), code: 'HONEYPOT' },
        { status: 400 },
      );
    }

    // 2.6 Turnstile verification
    const bodyRecord = body as Record<string, unknown>;
    const cfToken = typeof bodyRecord.cfToken === 'string' ? bodyRecord.cfToken : '';
    const turnstileOk = await verifyTurnstileToken(cfToken, getClientIpBrute(request));
    if (!turnstileOk) {
      const hasTurnstileSecret = Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());
      return NextResponse.json(
        {
          error: hasTurnstileSecret ? t('captchaFailed') : t('invalidDataFallback'),
          code: 'CAPTCHA_FAILED',
        },
        { status: 400 },
      );
    }

    const {
      cfToken: _cf,
      website: _legacyHp,
      [HONEYPOT_FIELD]: _hp,
      ...signupPayload
    } = bodyRecord;
    void _cf;
    void _legacyHp;
    void _hp;

    const parseResult = signupSchema.safeParse(signupPayload);
    if (!parseResult.success) {
      const rawMessage = parseResult.error.issues[0]?.message ?? t('invalidDataFallback');
      const firstError =
        rawMessage.includes('received undefined') || rawMessage.includes('required')
          ? 'Donnees invalides ou manquantes'
          : rawMessage;
      return NextResponse.json({ error: firstError, code: 'VALIDATION' }, { status: 400 });
    }

    signupEmail = parseResult.data.email;

    // 3. Execute signup via service
    const supabase = createAdminClient();

    // A-08: le refus "nom pris" est decide AVANT toute creation de compte, donc
    // il est identique que l'adresse soit nouvelle ou deja inscrite. Apres la
    // creation de l'utilisateur, il ne tombait que pour une adresse nouvelle.
    let nameTaken: boolean;
    try {
      nameTaken = await isRestaurantNameTaken(supabase, parseResult.data.restaurantName);
    } catch {
      // Echec ferme, meme reponse pour une adresse nouvelle ou deja inscrite.
      return NextResponse.json(
        { error: t('signupTemporarilyUnavailable'), code: 'TEMPORARILY_UNAVAILABLE' },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
    }
    if (nameTaken) {
      return NextResponse.json(
        { error: t('restaurantNameTaken'), code: 'RESTAURANT_NAME_TAKEN' },
        { status: 409 },
      );
    }
    const signupService = createSignupService(supabase);

    const result = await signupService.completeEmailSignup(parseResult.data);

    // A/B test: shorten trial to 7d if variant is assigned
    const cookieHeader = request.headers.get('cookie') ?? '';
    const trialVariant = parseAbTrialFromCookieHeader(cookieHeader);
    if (trialVariant === '7d') {
      const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const { data: updated, error: trialErr } = await supabase
        .from('tenants')
        .update({ trial_ends_at: trialEndsAt })
        .eq('id', result.tenantId)
        .select('id');
      if (trialErr || !updated?.length) {
        logger.warn('AB test: failed to apply 7d trial', {
          error: trialErr,
          tenantId: result.tenantId,
        });
      }
    }

    return NextResponse.json(signupAcceptedBody(result.emailDelivered ?? false, t));
  } catch (error) {
    if (error instanceof ServiceError) {
      let errorMessage = error.message;
      let code: string = error.code;
      if (error.code === 'CONFLICT' && error.message === 'EMAIL_ALREADY_REGISTERED') {
        // A-08: meme reponse qu'une inscription reussie. Dire "cette adresse a
        // deja un compte" faisait de ce formulaire un oracle d'enumeration des
        // comptes (les limites de debit et l'anti-robot ralentissent, elles
        // n'empechent pas de sonder une liste d'adresses).
        logger.info('Signup: adresse deja inscrite, reponse neutre', {
          code: 'EMAIL_ALREADY_REGISTERED',
        });
        // Plafond par DESTINATAIRE (3 par heure, cle = empreinte de l'adresse): la
        // route ne doit pas servir a arroser la boite d'un tiers. Au-dela, on
        // n'envoie rien, en silence, et la reponse reste identique.
        if (signupEmail && (await signupExistsEmailAllowed(signupEmail))) {
          // Meme travail cote serveur que pour un compte cree (un envoi), et le
          // titulaire est prevenu qu'on a essaye son adresse. Meilleur effort.
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
          await sendSignupAccountExistsEmail(signupEmail, {
            loginUrl: `${appUrl}/login`,
            forgotPasswordUrl: `${appUrl}/forgot-password`,
          }).catch((err: unknown) => {
            logger.warn('Signup: courriel "compte existant" non envoye', { error: String(err) });
            return false;
          });
        }
        return NextResponse.json(signupAcceptedBody(true, t));
      } else if (error.code === 'CONFLICT' && error.message === 'RESTAURANT_NAME_TAKEN') {
        errorMessage = t('restaurantNameTaken');
        code = 'RESTAURANT_NAME_TAKEN';
      }
      return NextResponse.json(
        { error: errorMessage, code },
        { status: serviceErrorToStatus(error.code) },
      );
    }
    logger.error('Signup error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
