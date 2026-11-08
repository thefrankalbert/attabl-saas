import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logger, hashEmail } from '@/lib/logger';
import { resendConfirmationSchema } from '@/lib/validations/auth.schema';
import {
  resendConfirmationLimiter,
  resendConfirmationAdresseLimiter,
  getClientIp,
  grouperAdresse,
  envoiAutorisePourCompte,
  cleCompte,
  minutesAvantLiberation,
} from '@/lib/rate-limit';
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

    // 1. Garde par ADRESSE, large. La garde serree est passee sur le COMPTE
    // (plus bas): comptee par adresse, elle punissait le Wi-Fi d'un restaurant
    // alors que l'abus vise une boite mail precise.
    const ip = getClientIp(request);
    const adresse = grouperAdresse(ip);
    const refus = (reset: number) =>
      NextResponse.json(
        { error: `Trop de tentatives. Reessayez dans ${minutesAvantLiberation(reset)} minutes.` },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.max(60, minutesAvantLiberation(reset) * 60)) },
        },
      );

    // La garde d'adresse est consommee PLUS BAS, apres le controle par compte:
    // consommee ici, un seul utilisateur qui reclame son mail dix fois epuisait
    // le budget de toute l'adresse, alors que la regle par compte l'arrete des
    // le 4e essai.

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

    // 2.5 Garde serree par COMPTE.
    const SAFE_MSG =
      'Si un compte existe avec cet email, un nouveau lien de confirmation a ete envoye.';

    // LE PLAFOND PAR COMPTE NE REFUSE RIEN, VOLONTAIREMENT. Rendre 429 ici
    // permettait a quiconque connaissant l'email d'un nouveau client de le
    // priver DEFINITIVEMENT de son mail de bienvenue: il recoit 403 a la
    // connexion (email non confirme) et ne peut plus se le faire renvoyer -
    // enferme dehors pour de bon. On s'arrete donc en silence, avec la MEME
    // reponse que d'habitude.
    const etatCompte = await resendConfirmationLimiter.check(`${cleCompte(email)}:${adresse}`);
    if (!etatCompte.success) {
      logger.info('Resend confirmation: plafond par compte atteint, aucun envoi', {
        emailHash: hashEmail(email),
      });
      return NextResponse.json({ success: true, message: SAFE_MSG });
    }

    // Garde de COUT par adresse, consommee seulement maintenant.
    const etatAdresse = await resendConfirmationAdresseLimiter.check(adresse);
    if (!etatAdresse.success) return refus(etatAdresse.reset);
    const supabase = createAdminClient();

    // INTERVALLE MINIMUM PAR COMPTE, toutes adresses confondues - ET AVANT DE
    // GENERER LE LIEN.
    //
    // L ORDRE EST LE POINT. Pose apres `generateLink`, ce verrou laissait un
    // attaquant PERIMER le lien de confirmation que le nouveau client venait de
    // recevoir, sans qu aucun mail ne parte: enferme dehors sans trace. Pose
    // avant, une requete etouffee ne fabrique aucun jeton.
    if (!(await envoiAutorisePourCompte(cleCompte(email)))) {
      logger.info('Resend confirmation: envoi trop rapproche, ignore', {
        emailHash: hashEmail(email),
      });
      return NextResponse.json({ success: true, message: SAFE_MSG });
    }

    // 3. Generate a fresh confirmation link directly (O(1), no listUsers pagination issues).
    //    generateLink({ type: 'signup' }) will fail if the user doesn't exist or is
    //    already confirmed, which we handle as a silent success (anti-enumeration).
    // password is required by TS types for type:'signup' but the Supabase API
    // accepts an empty string for existing users (it won't update their password).
    //
    // HYPOTHESE NON MESUREE (reserve S3 du contre-audit LOT 6), a ne pas lire
    // comme un fait: la phrase ci-dessus ("it won't update their password") n'a
    // jamais ete eprouvee contre une vraie instance GoTrue. Si un `password: ''`
    // ECRASAIT le mot de passe d'un compte existant, cette route - publique,
    // bornee a 3 par 10 minutes par IP - permettrait de vider le mot de passe de
    // n'importe quel compte connu par son adresse. A trancher par une mesure sur
    // base jetable, pas par relecture de la documentation.
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
        logger.info('Resend confirmation: user not found or already confirmed', {
          emailHash: hashEmail(email),
        });
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
