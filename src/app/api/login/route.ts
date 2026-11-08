import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { loginSchema } from '@/lib/validations/auth.schema';
import {
  loginCompteLimiter,
  loginAdresseLimiter,
  getClientIp,
  cleCompte,
  minutesAvantLiberation,
} from '@/lib/rate-limit';
import { verifyOrigin } from '@/lib/csrf';
import { getTranslations } from 'next-intl/server';
import { isHoneypotTriggered } from '@/lib/honeypot';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { mapMembershipRows, postLoginDestination } from '@/lib/auth/post-login-destination';

export async function POST(request: Request) {
  try {
    const originErr = verifyOrigin(request);
    if (originErr) return originErr;

    const t = await getTranslations('errors');

    // 0. Garde par ADRESSE, consultee sans etre consommee.
    //
    // ON NE COMPTE QUE LES ECHECS, et c'est le coeur de la correction. Avant,
    // le compteur etait consomme ici, donc une connexion REUSSIE coutait un
    // essai: quatre employes qui se connectent le matin depuis le meme Wi-Fi,
    // un cinquieme qui se trompe une fois, et toute l'equipe etait dehors pour
    // 15 minutes. Une connexion reussie n'est pas une attaque.
    const ip = getClientIp(request);
    const refus = (etat: { reset: number }) =>
      NextResponse.json(
        { error: t('rateLimitedMinutes', { minutes: minutesAvantLiberation(etat.reset) }) },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(60, minutesAvantLiberation(etat.reset) * 60)),
          },
        },
      );

    // ATOMIQUE, et c'est le point: `check` compte et tranche en une seule
    // operation. Une version precedente lisait le compteur puis comptait
    // l'echec plus tard; cent requetes simultanees passaient alors toutes la
    // lecture avant que la premiere n'ait compte, et la limite devenait "200
    // par aller-retour reseau" au lieu de "200 par 15 minutes".
    const etatAdresse = await loginAdresseLimiter.check(ip);
    if (!etatAdresse.success) return refus(etatAdresse);

    // 1. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t('invalidRequestBody') }, { status: 400 });
    }

    // 1.5 Honeypot check - silent bot rejection
    if (isHoneypotTriggered(body)) {
      return NextResponse.json({ error: t('invalidLoginFields') }, { status: 400 });
    }

    // 1.6 Turnstile verification
    const cfToken =
      typeof (body as Record<string, unknown>).cfToken === 'string'
        ? ((body as Record<string, unknown>).cfToken as string)
        : '';
    const turnstileOk = await verifyTurnstileToken(cfToken, ip);
    if (!turnstileOk) {
      return NextResponse.json({ error: t('invalidLoginFields') }, { status: 400 });
    }

    const parseResult = loginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: t('invalidLoginFields') }, { status: 400 });
    }

    const { email, password } = parseResult.data;

    // La cle du compte est une EMPREINTE de l'email: un compteur n'a pas a
    // devenir un annuaire des comptes du service.
    //
    // ON NE REFUSE RIEN ICI, VOLONTAIREMENT. Barrer la route sur le compteur du
    // compte avant d'authentifier permettait a quiconque connaissant un email
    // de verrouiller ce compte 15 minutes, en boucle - le proprietaire d'un
    // restaurant inclus. Un mot de passe correct doit toujours passer.
    const compte = cleCompte(email);

    // 2. Authenticate with Supabase
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Prefer Supabase's error.code (stable, locale-independent) over
      // error.message (localized by Supabase, changes across versions).
      // authError is AuthApiError which exposes a code property.
      const authCode = (authError as { code?: string }).code;

      // `email_not_confirmed` signifie que le mot de passe etait BON: ce n'est
      // pas une tentative ratee, et la compter punirait quelqu'un qui n'a
      // simplement pas encore clique dans son mail de bienvenue.
      if (authCode === 'email_not_confirmed') {
        return NextResponse.json({ error: t('emailNotConfirmed'), email }, { status: 403 });
      }

      // Echec reel: on le compte sur le compte. Le compteur d'adresse a deja
      // ete consomme en amont - le compter une seconde fois punirait deux fois
      // la meme tentative.
      const etatCompte = await loginCompteLimiter.compterEchec(compte);

      // C'est APRES l'echec que le compteur du compte peut refuser. Le mot de
      // passe etait faux de toute facon: on ne verrouille personne qui aurait
      // pu entrer.
      if (!etatCompte.success) return refus(etatCompte);

      if (authCode === 'invalid_credentials') {
        return NextResponse.json({ error: t('invalidCredentials') }, { status: 401 });
      }
      logger.error('Login failed', authError);
      return NextResponse.json({ error: t('loginError') }, { status: 401 });
    }

    // 2.5 Reussite: on efface le compteur DU COMPTE, et seulement lui. Pas
    // celui de l'adresse - sinon un attaquant possedant un compte valide
    // remettrait le sien a zero entre deux rafales.
    await loginCompteLimiter.effacer(compte);

    // 3. Query admin_users for routing info.
    //
    // `is_active` / `deleted_at` / `created_at` sont selectionnes parce que la
    // destination en depend: un membre banni ne doit pas etre route comme un
    // membre vivant, et l'etablissement d'arrivee d'un membre de plusieurs
    // restaurants est le plus ancien (regle fixe).
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select(
        'tenant_id, is_super_admin, role, is_active, deleted_at, tenants(slug, onboarding_completed, created_at)',
      )
      .eq('user_id', authData.user.id);

    // 4. Determine redirect.
    //
    // La regle vit dans `postLoginDestination`, partagee avec le retour OAuth:
    // elle y etait ecrite deux fois, et les deux copies envoyaient TOUT role
    // vers `/admin/tenants`, qui refuse quiconque n'est pas proprietaire.
    //
    // Anti-enumeration: un compte sans aucune ligne `admin_users` est un
    // abandon d'onboarding, pas une erreur. La regle le renvoie au parcours
    // plutot que de laisser filtrer "ce compte existe mais n'a pas
    // d'etablissement".
    return NextResponse.json({
      success: true,
      redirect: postLoginDestination(mapMembershipRows(adminUsers)),
    });
  } catch (error) {
    logger.error('Login route error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
