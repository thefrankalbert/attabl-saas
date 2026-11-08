import { describe, it, expect } from 'vitest';
import { verifierEndpointPush } from '../endpoints-autorises';

/**
 * Ce que ces tests verrouillent.
 *
 * L'`endpoint` d'un abonnement est une URL que le SERVEUR appelle lui-meme.
 * Le schema acceptait `z.string().url()`, donc n'importe quelle adresse: un
 * titulaire de compte pouvait faire emettre des requetes depuis nos serveurs
 * vers une cible interne de son choix, et les declencher quand il voulait en
 * passant une commande. Les cas ci-dessous sont les cibles classiques.
 */

describe('verifierEndpointPush', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc123', 'Chrome et Chromium'],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', 'Firefox'],
    ['https://web.push.apple.com/QABC123', 'Safari'],
    ['https://par02p.notify.windows.com/w/?token=x', 'Windows'],
    ['https://sous.domaine.fcm.googleapis.com/x', 'sous-domaine d un hote connu'],
  ])('accepte %s (%s)', (endpoint) => {
    expect(verifierEndpointPush(endpoint).autorise).toBe(true);
  });

  it.each([
    ['http://169.254.169.254/latest/meta-data/', 'pas-https', 'metadonnees du nuage'],
    ['http://127.0.0.1:5432/', 'pas-https', 'base de donnees locale'],
    ['https://10.0.0.5/interne', 'hote-inconnu', 'adresse privee en https'],
    ['https://fcm.googleapis.com:8080/x', 'port-explicite', 'balayage de ports'],
    ['https://attaquant:secret@fcm.googleapis.com/x', 'identifiants-dans-url', 'identifiants'],
    ['https://exemple.test/webhook', 'hote-inconnu', 'serveur quelconque'],
    ['https://fcm.googleapis.com.attaquant.test/x', 'hote-inconnu', 'suffixe trompeur'],
    ['pas-une-url', 'url-illisible', 'chaine invalide'],
  ])('refuse %s (%s)', (endpoint, raisonAttendue) => {
    const verdict = verifierEndpointPush(endpoint);
    expect(verdict.autorise).toBe(false);
    if (!verdict.autorise) expect(verdict.raison).toBe(raisonAttendue);
  });

  /**
   * `fcm.googleapis.com.attaquant.test` ressemble a un hote legitime et n'en est
   * pas un. Un test de sous-chaine (`includes`) l'accepterait: c'est l'erreur
   * classique, et elle donnerait a l'attaquant exactement ce qu'il cherche.
   */
  it('ne se fait pas prendre par un hote qui CONTIENT un hote legitime', () => {
    // Un test de sous-chaine (`includes`) accepterait ces deux hotes. Le
    // premier appartient a l attaquant. Le second est un autre domaine que
    // `fcm.googleapis.com`: seul le nom exact, ou un de ses sous-domaines
    // (prefixe par un point), est accepte.
    expect(verifierEndpointPush('https://fcm.googleapis.com.mechant.test/x').autorise).toBe(false);
    expect(verifierEndpointPush('https://mechantfcm.googleapis.com/x').autorise).toBe(false);
  });
});
