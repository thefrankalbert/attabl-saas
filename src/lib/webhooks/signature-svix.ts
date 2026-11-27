import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verification d'une signature de webhook au format Standard Webhooks / Svix
 * (utilise par Resend), sans dependance: le paquet `svix` n'est pas installe.
 *
 *   contenu signe = `${svix-id}.${svix-timestamp}.${corps brut}`
 *   signature     = base64(HMAC-SHA256(cle, contenu signe))
 *   cle           = base64-decode(secret sans le prefixe `whsec_`)
 *   en-tete       = une ou plusieurs entrees `v1,<signature>` separees par des
 *                   espaces (rotation de secret: deux signatures valides).
 *
 * Refus si l'horodatage s'ecarte de plus de 5 minutes de l'heure du serveur
 * (dans un sens ou dans l'autre): une requete capturee ne peut pas etre rejouee
 * plus tard. Comparaison en temps constant.
 */

const TOLERANCE_HORODATAGE_S = 5 * 60;

export interface EntetesSvix {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type VerdictSignature =
  | { valide: true }
  | { valide: false; raison: 'entetes_manquants' | 'horodatage_perime' | 'signature_invalide' };

function cleDuSecret(secret: string): Buffer {
  const brut = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  return Buffer.from(brut, 'base64');
}

export function verifierSignatureSvix(
  corps: string,
  entetes: EntetesSvix,
  secret: string,
  maintenantMs: number = Date.now(),
): VerdictSignature {
  const { id, timestamp, signature } = entetes;
  if (!id || !timestamp || !signature) return { valide: false, raison: 'entetes_manquants' };

  if (!/^\d{1,12}$/.test(timestamp)) return { valide: false, raison: 'horodatage_perime' };
  const ecartS = Math.abs(Math.floor(maintenantMs / 1000) - Number(timestamp));
  if (ecartS > TOLERANCE_HORODATAGE_S) return { valide: false, raison: 'horodatage_perime' };

  const cle = cleDuSecret(secret);
  if (cle.length === 0) return { valide: false, raison: 'signature_invalide' };
  const attendue = createHmac('sha256', cle).update(`${id}.${timestamp}.${corps}`).digest();

  for (const entree of signature.split(' ')) {
    const [version, valeur] = entree.split(',', 2);
    if (version !== 'v1' || !valeur) continue;
    const donnee = Buffer.from(valeur, 'base64');
    if (donnee.length === attendue.length && timingSafeEqual(donnee, attendue)) {
      return { valide: true };
    }
  }
  return { valide: false, raison: 'signature_invalide' };
}
