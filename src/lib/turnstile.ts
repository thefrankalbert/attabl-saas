import { logger } from '@/lib/logger';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Turnstile se contourne de lui-meme quand ses cles manquent, et c'etait
 * SILENCIEUX.
 *
 * Constat d'un audit du 2026-11-08: une cle expiree, renommee, ou absente d'un
 * environnement desactivait la verification sans un seul message. Or Turnstile
 * est la premiere ligne de defense des pages de connexion et d'inscription: la
 * perdre sans le savoir est exactement le defaut qu'on ne decouvre qu'apres.
 *
 * ON NE FAIT PAS ECHOUER EN MODE FERME, et c'est un choix assume: refuser
 * toutes les connexions parce qu'une variable d'environnement a disparu
 * remplacerait une faille discrete par une panne totale. On journalise donc en
 * ERREUR en production - Sentry le remonte - et on laisse passer. Les
 * compteurs de debit (`rate-limit.ts`) portent desormais une vraie borne par
 * couple (compte, adresse), ce qui n'etait pas le cas quand ce code a ete
 * ecrit: le contournement n'est plus une porte grande ouverte.
 */
function isTurnstileBypassed(): boolean {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

  if (!secret || !siteKey) {
    if (process.env.NODE_ENV === 'production') {
      logger.error(
        'Turnstile DESACTIVE en production: cle manquante - la protection anti-robot des pages de connexion et d inscription ne s applique plus',
        { secretPresent: !!secret, sitePresent: !!siteKey },
      );
    }
    return true;
  }

  if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
    return true;
  }
  return false;
}

export async function verifyTurnstileToken(token: string, ip?: string): Promise<boolean> {
  if (isTurnstileBypassed()) return true;

  const secret = process.env.TURNSTILE_SECRET_KEY!;
  if (!token.trim()) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.append('remoteip', ip);

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, { method: 'POST', body });
  } catch {
    return false;
  }

  if (!res.ok) return false;

  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
