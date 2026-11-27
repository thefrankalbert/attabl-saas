import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { kitchenItemLimiter, getClientIp } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifierSignatureSvix } from '@/lib/webhooks/signature-svix';
import { resendWebhookEventSchema } from '@/lib/validations/webhooks.schema';
import { createEmailSuppressionService } from '@/services/email-suppression.service';

/**
 * Webhook Resend (audit R8): rebonds definitifs et plaintes.
 *
 * Ordre: limiteur, secret present, corps borne, SIGNATURE (Svix), validation
 * Zod, service. Aucune authentification de session: c'est la signature qui
 * prouve que l'appel vient de Resend.
 *
 * LIMITEUR. Le depot n'a pas de compartiment "webhook" (un webhook ne doit pas
 * etre bride: le fournisseur reessaie). On reutilise un compartiment large et
 * fail-OPEN (240 par minute), avec une cle propre a cette route et a l'adresse:
 * il borne une inondation de requetes forgees sans jamais faire perdre un
 * evenement legitime si Redis tombe.
 *
 * Reponses: 2xx pour tout evenement authentifie (traite ou ignore); 401 pour
 * une signature refusee; 503 si le secret manque (jamais d'acceptation sans
 * verification); 500 si la base refuse (Resend relance).
 */

const TAILLE_MAX_CORPS = 64 * 1024;

export async function POST(request: Request) {
  const limite = await kitchenItemLimiter.check(`webhook-resend:${getClientIp(request)}`);
  if (!limite.success) {
    return NextResponse.json({ error: 'Trop de requetes' }, { status: 429 });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('Resend webhook: RESEND_WEBHOOK_SECRET absent, evenement refuse');
    return NextResponse.json({ error: 'Service indisponible' }, { status: 503 });
  }

  const corps = await request.text();
  if (corps.length > TAILLE_MAX_CORPS) {
    return NextResponse.json({ error: 'Corps trop volumineux' }, { status: 413 });
  }

  const evenementId = request.headers.get('svix-id');
  const verdict = verifierSignatureSvix(
    corps,
    {
      id: evenementId,
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    secret,
  );
  if (!verdict.valide) {
    logger.warn('Resend webhook: signature refusee', { raison: verdict.raison });
    return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
  }

  let brut: unknown;
  try {
    brut = JSON.parse(corps);
  } catch {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }
  const parsed = resendWebhookEventSchema.safeParse(brut);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
  }

  try {
    const service = createEmailSuppressionService(createAdminClient());
    const bloquees = await service.appliquerEvenement(parsed.data, evenementId ?? '');
    if (bloquees > 0) {
      logger.info('Resend webhook: adresses bloquees', { type: parsed.data.type, bloquees });
    }
    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    logger.error('Resend webhook: traitement en echec', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
