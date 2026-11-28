import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { runApiRoute } from '@/lib/api-route-context';
import { verifyOrigin } from '@/lib/csrf';
import { cleCompte, getClientIp, invitationValidateLimiter } from '@/lib/rate-limit';
import { readUnsubscribeToken } from '@/lib/email-unsubscribe-token';
import {
  unsubscribeRequestSchema,
  unsubscribeTokenSchema,
  type UnsubscribeRequest,
} from '@/lib/validations/email-unsubscribe.schema';
import { createEmailUnsubscribeService } from '@/services/email-unsubscribe.service';

/**
 * Desabonnement des relances commerciales (lot desabonnement).
 *
 * POST, deux formes:
 *   - RFC 8058 (bouton "Se desabonner" de la messagerie): jeton dans l'URL
 *     `?t=`, corps `List-Unsubscribe=One-Click`. Envoye par les serveurs de la
 *     messagerie: aucune verification d'origine possible, et inutile (rien ne
 *     se fait sans jeton authentique).
 *   - Page `/unsubscribe`: corps JSON `{ token, action }`, `action` valant
 *     `unsubscribe` ou `resubscribe`. Origine verifiee.
 * GET: un client de messagerie sans "un clic" ouvre l'URL dans le navigateur;
 *   il est renvoye vers la page, qui demande confirmation. Un GET ne modifie
 *   jamais rien (les antivirus et apercus de liens en font).
 *
 * PAS D'ORACLE: la reponse ne depend que du jeton, jamais de l'existence d'un
 * compte. Aucune table de comptes n'est lue; la reponse est identique pour une
 * adresse connue ou inconnue d'ATTABL, deja desabonnee ou non.
 *
 * service_role: la personne qui se desabonne n'est pas connectee, et la table
 * n'a aucun droit client. L'adresse ecrite vient UNIQUEMENT du jeton dechiffre
 * et authentifie (AES-256-GCM), jamais d'un parametre libre.
 *
 * Limite de debit: limiteur existant `invitationValidateLimiter` (public,
 * 30 / 10 min, fail-open: aucune ecriture dangereuse, et refuser un
 * desabonnement a cause d'une panne Redis serait pire). Le jeton est verifie
 * D'ABORD (dechiffrement local, sans aucune lecture en base), puis:
 *   - jeton authentique: compteur PAR ADRESSE (empreinte SHA-256, jamais
 *     l'adresse en clair). Une adresse IP partagee (CGNAT des reseaux mobiles,
 *     serveurs de Google pour le bouton des messageries) ne peut donc pas
 *     faire refuser le desabonnement d'une autre personne: un 429 renvoye a
 *     une messagerie perd le desabonnement, RFC 8058 ne prevoit pas de reprise
 *     (contre-audit 1, D3);
 *   - requete ou jeton invalide: compteur par IP, pour freiner le bruit.
 */

const INVALID_LINK = { error: 'invalid_link' } as const;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = unsubscribeTokenSchema.safeParse(url.searchParams.get('t'));
  const target = new URL('/unsubscribe', url.origin);
  if (token.success) target.searchParams.set('t', token.data);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request): Promise<Response> {
  return runApiRoute(request, async () => {
    const input = await readInput(request);
    const email = input && input !== 'forbidden' ? readUnsubscribeToken(input.token) : null;

    const key = email
      ? `unsubscribe:${cleCompte(email)}`
      : `unsubscribe-invalid:${getClientIp(request)}`;
    const { success: allowed } = await invitationValidateLimiter.check(key);
    if (!allowed) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }
    if (input === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (!input || !email) return NextResponse.json(INVALID_LINK, { status: 400 });

    try {
      const service = createEmailUnsubscribeService(createAdminClient());
      if (input.action === 'resubscribe') await service.resubscribe(email);
      else await service.unsubscribe(email);
      return NextResponse.json({ ok: true, action: input.action });
    } catch (error) {
      logger.error('Email unsubscribe failed', error, { action: input.action });
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }
  });
}

/** Lit l'une des deux formes de requete; `null` si elle est invalide. */
async function readInput(request: Request): Promise<UnsubscribeRequest | 'forbidden' | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const originError = verifyOrigin(request);
    if (originError) return 'forbidden';
    const body: unknown = await request.json().catch(() => null);
    const parsed = unsubscribeRequestSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  }

  // RFC 8058: multipart/form-data ou application/x-www-form-urlencoded.
  const form = await request.formData().catch(() => null);
  if (form?.get('List-Unsubscribe') !== 'One-Click') return null;
  const token = unsubscribeTokenSchema.safeParse(new URL(request.url).searchParams.get('t'));
  return token.success ? { token: token.data, action: 'unsubscribe' } : null;
}
