import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { loginSchema } from '@/lib/validations/auth.schema';
import {
  loginPaireLimiter,
  loginAdresseLimiter,
  getClientIp,
  grouperAdresse,
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
    // CLE DE COMPTAGE regroupee: en IPv6, un abonne ordinaire dispose d un /64,
    // soit des milliards d adresses - compter par adresse exacte ne le limite
    // en rien. `ip` brute reste utilisee pour Turnstile, qui attend une vraie
    // adresse.
    const adresse = grouperAdresse(ip);
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
    const etatAdresse = await loginAdresseLimiter.check(adresse);
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

    // 1.7 LA GARDE QUI BORNE REELLEMENT LES ESSAIS, sur le couple
    // (compte, adresse), consommee ATOMIQUEMENT avant d'authentifier.
    //
    // Deux conceptions precedentes ont echoue ici, et pour des raisons
    // opposees: refuser sur le compte SEUL permettait a quiconque connaissant
    // un email de verrouiller ce compte en boucle; ne compter qu'apres
    // l'authentification rendait le plafond decoratif, puisque chaque requete
    // testait quand meme un mot de passe (800 essais par heure au lieu de 20).
    //
    // Le couple resout les deux: un attaquant n'epuise que SON propre budget
    // sur ce compte, et le proprietaire garde le sien intact depuis son
    // adresse. La cle du compte est une empreinte de l'email - un compteur n'a
    // pas a devenir un annuaire des comptes du service.
    const compte = cleCompte(email);
    const etatPaire = await loginPaireLimiter.check(`${compte}:${adresse}`);
    if (!etatPaire.success) return refus(etatPaire);

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

      // Les deux compteurs ont deja ete consommes en amont: rien a compter
      // ici. Une version precedente exemptait `email_not_confirmed` du
      // comptage, au motif que le mot de passe etait alors correct - une
      // affirmation sur l'ordre interne de Supabase que ce depot ne peut pas
      // verifier, et qui offrait des essais gratuits si elle etait fausse.
      if (authCode === 'email_not_confirmed') {
        return NextResponse.json({ error: t('emailNotConfirmed'), email }, { status: 403 });
      }

      if (authCode === 'invalid_credentials') {
        return NextResponse.json({ error: t('invalidCredentials') }, { status: 401 });
      }
      logger.error('Login failed', authError);
      return NextResponse.json({ error: t('loginError') }, { status: 401 });
    }

    // 3. Query admin_users for routing info.
    //
    // `is_active` / `deleted_at` / `created_at` sont selectionnes parce que la
    // destination en depend: un membre banni ne doit pas etre route comme un
    // membre vivant, et l'etablissement d'arrivee d'un membre de plusieurs
    // restaurants est le plus ancien (regle fixe).
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select(
        'id, tenant_id, is_super_admin, role, is_active, deleted_at, tenants(slug, onboarding_completed, created_at, deleted_at)',
      )
      .eq('user_id', authData.user.id);

    // Record the login, as the OAuth callback does. Without it every member who
    // signs in with a password stayed "Never logged in" on the team page.
    // Best effort: a failed counter must never block a login.
    const membres = (adminUsers ?? []).filter((m) => m.is_active !== false && !m.deleted_at);
    const suivis = await Promise.allSettled(
      membres.map((m) => supabase.rpc('increment_login_count', { admin_user_id: m.id })),
    );
    for (const suivi of suivis) {
      const echec = suivi.status === 'rejected' ? suivi.reason : suivi.value.error;
      if (echec) logger.warn('Login tracking failed', { error: String(echec) });
    }

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
