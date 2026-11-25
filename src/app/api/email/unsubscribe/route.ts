import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { invitationValidateLimiter } from '@/lib/rate-limit';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe-token';
import {
  unsubscribeOneClickBodySchema,
  unsubscribeQuerySchema,
} from '@/lib/validations/unsubscribe.schema';
import { createEmailUnsubscribeService } from '@/services/email-unsubscribe.service';

/**
 * Desinscription des e-mails de relance (R5/T9), conforme RFC 8058.
 *
 * POST /api/email/unsubscribe?token=...  corps `List-Unsubscribe=One-Click`
 *   - appele par la messagerie (bouton "Se desabonner" de Gmail, Yahoo...) via
 *     l'en-tete List-Unsubscribe-Post, ou par le bouton de la page /unsubscribe;
 *   - pas de session ni de controle d'origine: la messagerie poste depuis ses
 *     propres serveurs. L'autorisation est le jeton signe (HMAC).
 *
 * GET /api/email/unsubscribe?token=...
 *   - NE DESINSCRIT JAMAIS (les scanners de liens prefetchent les URL des
 *     e-mails): redirige vers la page de confirmation.
 *
 * Aucune fuite: un jeton bien forme mais faux recoit la MEME reponse qu'un
 * jeton valide (200 { ok: true }). Seule une forme invalide (Zod) rend 400.
 *
 * Limiteur: aucun limiteur dedie n'existe et rate-limit.ts est protege; on
 * reutilise `invitationValidateLimiter` (30 / 10 min, fail-open), cle prefixee
 * `unsubscribe:` et derivee du jeton. Par jeton et non par adresse IP: les
 * messageries postent toutes depuis quelques adresses partagees; fail-open:
 * une panne Redis ne doit pas empecher quelqu'un de se desinscrire.
 */

function rateLimitKey(token: string): string {
  return `unsubscribe:${createHash('sha256').update(token).digest('hex')}`;
}

const TOO_MANY = { error: 'Trop de requetes. Reessayez plus tard.' };

/** Lit le corps en urlencoded (cas usuel) ou multipart (permis par la RFC 8058). */
async function readFormBody(request: Request): Promise<Record<string, string> | null> {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const out: Record<string, string> = {};
      form.forEach((value, key) => {
        if (typeof value === 'string') out[key] = value;
      });
      return out;
    }
    const raw = await request.text();
    if (raw.length > 1000) return null;
    return Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const query = unsubscribeQuerySchema.safeParse({ token: url.searchParams.get('token') });
  if (!query.success) {
    return NextResponse.json({ error: 'Lien invalide' }, { status: 400 });
  }

  const { success: allowed } = await invitationValidateLimiter.check(
    rateLimitKey(query.data.token),
  );
  if (!allowed) {
    return NextResponse.json(TOO_MANY, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const body = unsubscribeOneClickBodySchema.safeParse(await readFormBody(request));
  if (!body.success) {
    return NextResponse.json({ error: 'Requete invalide' }, { status: 400 });
  }

  const subject = verifyUnsubscribeToken(query.data.token);
  if (subject) {
    try {
      await createEmailUnsubscribeService(createAdminClient()).optOut(subject);
    } catch (error) {
      logger.error('Desinscription des relances impossible', error, {
        tenantId: subject.tenantId,
      });
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = unsubscribeQuerySchema.safeParse({ token: url.searchParams.get('token') });
  if (!query.success) {
    return NextResponse.json({ error: 'Lien invalide' }, { status: 400 });
  }
  const { success: allowed } = await invitationValidateLimiter.check(
    rateLimitKey(query.data.token),
  );
  if (!allowed) {
    return NextResponse.json(TOO_MANY, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const page = new URL('/unsubscribe', url.origin);
  page.searchParams.set('token', query.data.token);
  return NextResponse.redirect(page, 303);
}
