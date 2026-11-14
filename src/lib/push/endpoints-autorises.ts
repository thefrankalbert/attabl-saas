/**
 * Qui a le droit de recevoir une notification push de notre part.
 *
 * POURQUOI CETTE LISTE EXISTE. Un abonnement push porte une URL (`endpoint`)
 * que le serveur appelle ensuite lui-meme. Le schema de validation acceptait
 * `z.string().url()`, donc n'importe quoi: `http://169.254.169.254/...`,
 * `http://127.0.0.1:5432/`, l'adresse interne de son choix. Un titulaire de
 * compte ATTABL pouvait donc faire emettre des requetes depuis nos serveurs
 * vers une cible arbitraire, et les declencher quand il voulait en passant une
 * commande. C'est une porte vers l'interieur de l'infrastructure (SSRF).
 *
 * Un abonnement push legitime ne vient QUE d'un des services de push des
 * navigateurs. La liste est donc fermee: ce qui n'y est pas n'est pas appele.
 *
 * SI UN NAVIGATEUR UTILISE UN HOTE ABSENT DE CETTE LISTE, son proprietaire ne
 * recevra rien. C'est pourquoi le refus est JOURNALISE avec l'hote: c'est le
 * seul moyen de decouvrir un hote legitime manquant. Ne jamais ouvrir la liste
 * "au cas ou" sans cette preuve.
 */

/** Suffixes d'hotes des services de push des navigateurs. */
const HOTES_AUTORISES = [
  // Chrome, Edge, Opera, Samsung Internet, et tout navigateur base sur Chromium
  'fcm.googleapis.com',
  'android.googleapis.com',
  // Firefox
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  // Safari (macOS, iOS en application installee)
  'push.apple.com',
  // Edge ancien / Windows
  'notify.windows.com',
  'push.services.microsoft.com',
] as const;

interface RefusEndpoint {
  autorise: false;
  /** Pourquoi, pour le journal. Jamais l'URL complete: elle identifie un appareil. */
  raison:
    'url-illisible' | 'pas-https' | 'port-explicite' | 'identifiants-dans-url' | 'hote-inconnu';
  /** L'hote seul: utile a diagnostiquer, et ce n'est pas un identifiant d'appareil. */
  hote: string | null;
}

export type VerdictEndpoint = { autorise: true } | RefusEndpoint;

export function verifierEndpointPush(endpoint: string): VerdictEndpoint {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { autorise: false, raison: 'url-illisible', hote: null };
  }

  const hote = url.hostname.toLowerCase();

  // https seulement: c'est ce qu'emettent tous les services de push, et cela
  // ecarte d'emblee les cibles internes en clair.
  if (url.protocol !== 'https:') return { autorise: false, raison: 'pas-https', hote };
  // Un port explicite n'a aucune raison d'apparaitre, et sert a balayer.
  if (url.port !== '') return { autorise: false, raison: 'port-explicite', hote };
  if (url.username !== '' || url.password !== '') {
    return { autorise: false, raison: 'identifiants-dans-url', hote };
  }

  const connu = HOTES_AUTORISES.some((a) => hote === a || hote.endsWith(`.${a}`));
  return connu ? { autorise: true } : { autorise: false, raison: 'hote-inconnu', hote };
}
