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
import { HONEYPOT_FIELD, isDevAuthBypassEnabled, isHoneypotTriggered } from '@/lib/honeypot';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { isRestaurantNameTaken } from '@/services/restaurant-name.service';
import {
  sendSignupAccountExistsEmail,
  sendSignupPasswordRejectedEmail,
  sendSignupFailedEmail,
} from '@/services/email.service';

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

/**
 * Refus qui recoivent la reponse d'une inscription reussie (aucun oracle), et
 * le courriel envoye a l'adresse a la place.
 */
// Une Map, pas un objet: un message nomme `toString` ou `constructor` ne doit
// rien trouver (contre-audit 3).
const NEUTRAL_REFUSALS = new Map<string, (email: string, appUrl: string) => Promise<boolean>>([
  // Le titulaire est prevenu qu'on a essaye son adresse.
  [
    'EMAIL_ALREADY_REGISTERED',
    (email, appUrl) =>
      sendSignupAccountExistsEmail(email, {
        loginUrl: `${appUrl}/login`,
        forgotPasswordUrl: `${appUrl}/forgot-password`,
      }),
  ],
  // Adresse neuve, mot de passe trop simple ou pirate: dire quoi changer.
  [
    'PASSWORD_REJECTED_BY_AUTH',
    (email, appUrl) => sendSignupPasswordRejectedEmail(email, { signupUrl: `${appUrl}/signup` }),
  ],
  // Contre-audit 4: tout autre refus d'Auth (panne passagere, HIBP injoignable
  // en echec ferme...) ne tombe aussi que pour une adresse neuve: meme chemin.
  [
    'SIGNUP_REJECTED_BY_AUTH',
    (email, appUrl) => sendSignupFailedEmail(email, { signupUrl: `${appUrl}/signup` }),
  ],
]);

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

    return NextResponse.json(signupAcceptedBody(result.emailDelivered ?? false, t));
  } catch (error) {
    if (error instanceof ServiceError) {
      let errorMessage = error.message;
      let code: string = error.code;
      const refusNeutre =
        error.code === 'CONFLICT' ? NEUTRAL_REFUSALS.get(error.message) : undefined;
      if (refusNeutre) {
        // A-08: meme reponse qu'une inscription reussie. Dire "cette adresse a
        // deja un compte" faisait de ce formulaire un oracle d'enumeration des
        // comptes (les limites de debit et l'anti-robot ralentissent, elles
        // n'empechent pas de sonder une liste d'adresses).
        //
        // Contre-audit 2: le mot de passe refuse par la politique Auth suit le
        // MEME chemin. GoTrue teste l'adresse avant le mot de passe, donc ce
        // refus ne tombe que pour une adresse neuve: une reponse a part aurait
        // dit qu'une adresse n'a pas de compte. Meme reponse, meme plafond par
        // destinataire, un envoi; seul le contenu du courriel change.
        logger.info('Signup: refus neutre', { code: error.message });
        // Plafond par DESTINATAIRE (3 par heure, cle = empreinte de l'adresse): la
        // route ne doit pas servir a arroser la boite d'un tiers. Au-dela, on
        // n'envoie rien, en silence, et la reponse reste identique.
        // `emailDelivered` suit l'envoi REEL, comme pour un compte cree: code en
        // dur a `true`, il trahissait l'existence du compte des que le
        // fournisseur d'e-mails etait en panne (compte neuf: false, compte
        // existant: true).
        let delivered = true;
        if (signupEmail && (await signupExistsEmailAllowed(signupEmail))) {
          // Meme travail cote serveur que pour un compte cree (un envoi). Meilleur effort.
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com';
          delivered = await refusNeutre(signupEmail, appUrl).catch((err: unknown) => {
            logger.warn('Signup: courriel de refus neutre non envoye', {
              code: error.message,
              error: String(err),
            });
            return false;
          });
        }
        return NextResponse.json(signupAcceptedBody(delivered, t));
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
