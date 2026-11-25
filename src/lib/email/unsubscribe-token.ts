import { z } from 'zod';
import { signPayload, verifyPayload } from '@/lib/auth/signed-payload';

/**
 * Jeton de desinscription des e-mails de relance (R5/T9).
 *
 * Sans etat: la base ne stocke rien, le jeton porte la ligne `admin_users`
 * visee (et son restaurant) et une signature HMAC-SHA256 (cle serveur +
 * etiquette propre a cet usage, voir signed-payload.ts; comparaison a temps
 * constant). Un jeton d'un autre usage (marqueur de reinitialisation...) ne
 * vaut rien ici, et inversement.
 *
 * Validite longue (2 ans): un lien de desinscription doit encore marcher des
 * semaines ou des mois apres l'envoi. Le jeton ne donne qu'UN droit: poser la
 * desinscription de cette personne pour ce restaurant.
 */

const LABEL = 'attabl:lifecycle-unsubscribe:v1:';
export const UNSUBSCRIBE_TOKEN_TTL_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const claimsSchema = z.object({
  aid: z.string().uuid(),
  tid: z.string().uuid(),
});

export interface UnsubscribeSubject {
  adminUserId: string;
  tenantId: string;
}

export function signUnsubscribeToken(
  subject: UnsubscribeSubject,
  now: number = Date.now(),
): string {
  return signPayload(
    LABEL,
    { aid: subject.adminUserId, tid: subject.tenantId },
    UNSUBSCRIBE_TOKEN_TTL_MS,
    now,
  );
}

/** Rend la personne visee, ou null si le jeton est falsifie, illisible ou expire. */
export function verifyUnsubscribeToken(
  token: string,
  now: number = Date.now(),
): UnsubscribeSubject | null {
  let claims: Record<string, unknown> | null;
  try {
    claims = verifyPayload(LABEL, token, now);
  } catch {
    return null;
  }
  const parsed = claimsSchema.safeParse(claims);
  if (!parsed.success) return null;
  return { adminUserId: parsed.data.aid, tenantId: parsed.data.tid };
}

export interface UnsubscribeLinks {
  /** Page publique de confirmation (bouton), pour le lien du pied de l'e-mail. */
  pageUrl: string;
  /** Point RFC 8058 (POST en un clic), pour l'en-tete List-Unsubscribe. */
  oneClickUrl: string;
}

/**
 * Liens absolus sur le DOMAINE PRINCIPAL (jamais un sous-domaine de
 * restaurant: le proxy y reecrirait la page vers /sites/<slug>/...).
 */
export function buildUnsubscribeLinks(subject: UnsubscribeSubject): UnsubscribeLinks {
  let origin = 'https://attabl.com';
  try {
    origin = new URL(process.env.NEXT_PUBLIC_APP_URL || origin).origin;
  } catch {
    // valeur illisible: on garde le domaine principal par defaut
  }
  const token = encodeURIComponent(signUnsubscribeToken(subject));
  return {
    pageUrl: `${origin}/unsubscribe?token=${token}`,
    oneClickUrl: `${origin}/api/email/unsubscribe?token=${token}`,
  };
}
