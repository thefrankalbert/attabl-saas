import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { unsubscribeTokenSchema } from '@/lib/validations/email-unsubscribe.schema';

/**
 * Jeton du lien de desabonnement des relances commerciales.
 *
 * POURQUOI UN CHIFFREMENT AUTHENTIFIE ET PAS UNE SIMPLE SIGNATURE: le lien ne
 * doit montrer ni un identifiant devinable ni l'adresse en clair. Une
 * signature HMAC seule oblige a mettre l'adresse a cote, lisible par
 * quiconque voit l'URL (journaux, historique, transfert). AES-256-GCM chiffre
 * l'adresse ET l'authentifie: un jeton modifie, tronque ou fabrique sans le
 * secret est refuse, et on ne peut pas en construire un pour une autre adresse.
 *
 * Pas d'expiration: un e-mail de relance peut etre ouvert des mois plus tard,
 * et son lien de desabonnement doit encore marcher (RFC 8058).
 *
 * Format (base64url): version (1 octet) | iv (12) | tag (16) | adresse chiffree.
 *
 * SECRET: `EMAIL_UNSUBSCRIBE_SECRET`, dedie, 32 caracteres au moins. Absent ou
 * trop court, aucun jeton n'est fabrique ni accepte: l'appelant n'envoie
 * alors AUCUNE relance commerciale (jamais d'e-mail sans lien valide).
 * Le changer rend invalides les liens des e-mails deja envoyes: ne pas le
 * faire tourner sans raison.
 */

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_SECRET_LENGTH = 32;
const AAD = Buffer.from('attabl-unsubscribe-v1');

const emailSchema = z.string().email().max(320);

/** Forme de comparaison d'une adresse: sans espaces autour, en minuscules. */
export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

function cle(): Buffer | null {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  // Cle derivee et etiquetee: le secret brut ne sert a rien d'autre.
  return createHash('sha256').update(`attabl-unsubscribe-key:${secret}`).digest();
}

/** Le secret est-il en place ? Sans lui, aucune relance commerciale ne part. */
export function isUnsubscribeConfigured(): boolean {
  return cle() !== null;
}

/** Fabrique le jeton d'une adresse, ou `null` si le secret manque ou l'adresse est invalide. */
export function createUnsubscribeToken(email: string): string | null {
  const key = cle();
  const normalized = normalizeEmailAddress(email);
  if (!key || !emailSchema.safeParse(normalized).success) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(AAD);
  const chiffre = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), chiffre]).toString(
    'base64url',
  );
}

/** Rend l'adresse normalisee portee par un jeton authentique, sinon `null`. */
export function readUnsubscribeToken(token: string): string | null {
  const key = cle();
  if (!key || !unsubscribeTokenSchema.safeParse(token).success) return null;
  const brut = Buffer.from(token, 'base64url');
  // Forme canonique exigee: le dernier caractere base64url porte des bits de
  // remplissage, ignores au decodage. Sans ce controle, un jeton dont on
  // change ce caractere (A en B, par exemple) etait encore accepte: pas de
  // fausse adresse possible, mais un jeton "modifie" ne doit pas passer.
  if (brut.toString('base64url') !== token) return null;
  if (brut.length <= 1 + IV_BYTES + TAG_BYTES || brut[0] !== VERSION) return null;
  const iv = brut.subarray(1, 1 + IV_BYTES);
  const tag = brut.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const chiffre = brut.subarray(1 + IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const adresse = Buffer.concat([decipher.update(chiffre), decipher.final()]).toString('utf8');
    return emailSchema.safeParse(adresse).success ? adresse : null;
  } catch {
    // Etiquette d'authentification fausse: jeton modifie, tronque ou fabrique.
    return null;
  }
}

export interface UnsubscribeLinks {
  /** Page de desabonnement (lien visible du pied de page). */
  pageUrl: string;
  /** Cible de `List-Unsubscribe` (POST en un clic, RFC 8058). */
  oneClickUrl: string;
}

/** Les deux liens d'une adresse, ou `null` si le jeton ne peut pas etre fabrique. */
export function buildUnsubscribeLinks(email: string): UnsubscribeLinks | null {
  const token = createUnsubscribeToken(email);
  if (!token) return null;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://attabl.com').replace(/\/+$/, '');
  const query = `t=${encodeURIComponent(token)}`;
  return {
    pageUrl: `${appUrl}/unsubscribe?${query}`,
    oneClickUrl: `${appUrl}/api/email/unsubscribe?${query}`,
  };
}
