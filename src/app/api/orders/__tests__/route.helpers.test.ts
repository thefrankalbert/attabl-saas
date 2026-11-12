import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const envoyerPush = vi.hoisted(() => vi.fn());
const taches = vi.hoisted(() => [] as (() => Promise<unknown>)[]);

vi.mock('server-only', () => ({}));
// `after()` differe le travail apres la reponse: ici on garde les taches pour
// les executer explicitement, sinon le test ne verifierait rien.
vi.mock('next/server', () => ({
  after: (tache: () => Promise<unknown>) => {
    taches.push(tache);
  },
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/push.service', () => ({
  createPushService: () => ({ envoyerAuxAppareilsDuTenant: envoyerPush }),
}));

import { scheduleOrderNotification, titreNouvelleCommande } from '../route.helpers';

/**
 * Ce que ces tests figent.
 *
 * Le service d'envoi etait teste, son CABLAGE ne l'etait pas: rien ne prouvait
 * que le push partait, ni avec quelle destination, ni qu'une commande survivait
 * a une notification en panne. Trois defauts reels sont verrouilles ici:
 *
 *   - un tag commun a toutes les commandes faisait disparaitre la precedente EN
 *     SILENCE (deux notifications de meme tag se remplacent, et sans
 *     `renotify` la seconde ne sonne pas): en coup de feu, le personnel ne
 *     preparait qu'une commande sur deux;
 *   - un chemin ecrit en dur (`/admin/orders`) ouvrait une 404 pour le
 *     personnel connecte par le domaine principal;
 *   - le numero de table est une chaine LIBRE venue d'un convive non
 *     authentifie, et elle atterrissait telle quelle dans l'alerte du personnel.
 */

let insertions: Record<string, unknown>[];
let reponseInsert: { error: unknown };

function fausseBase(): SupabaseClient {
  return {
    from: () => ({
      insert: async (ligne: Record<string, unknown>) => {
        insertions.push(ligne);
        return reponseInsert;
      },
    }),
  } as unknown as SupabaseClient;
}

const PARAMS = {
  tenantId: 'tenant-a',
  tenantSlug: 'mon-resto',
  tableNumber: '4',
  itemsCount: 3,
  total: 12500,
  currency: 'XOF',
  orderId: 'commande-1',
};

async function executerLesTaches() {
  const aFaire = [...taches];
  taches.length = 0;
  for (const tache of aFaire) await tache();
}

describe('titreNouvelleCommande', () => {
  it('garde une etiquette de table normale', () => {
    expect(titreNouvelleCommande('4')).toBe('Nouvelle commande - Table 4');
    expect(titreNouvelleCommande('Terrasse 2')).toBe('Nouvelle commande - Table Terrasse 2');
  });

  /**
   * 50 caracteres libres, envoyes par quelqu'un qui n'est pas connecte, sur
   * l'ecran de veille d'une tablette a laquelle le personnel fait confiance.
   */
  it('ne laisse pas un convive ecrire un message dans l alerte du personnel', () => {
    const titre = titreNouvelleCommande('URGENCE appelez le 70 00 00 00 tout de suite');
    expect(titre.length).toBeLessThanOrEqual('Nouvelle commande - Table '.length + 12);
    expect(titre).not.toContain('70 00 00 00');
  });

  it('retire les sauts de ligne, qui fabriquent un faux message sur plusieurs lignes', () => {
    const titre = titreNouvelleCommande('4\n\nFermez la cuisine');
    expect(titre).not.toMatch(/[\r\n]/);
    expect(titre.startsWith('Nouvelle commande - Table 4')).toBe(true);
  });

  it('retire ce qui sert a fabriquer un lien', () => {
    const titre = titreNouvelleCommande('http://x.test/a');
    expect(titre).not.toContain('//');
    expect(titre).not.toContain(':');
  });

  it('titre generique quand il ne reste rien, ou quand il n y a pas de table', () => {
    expect(titreNouvelleCommande('@@@')).toBe('Nouvelle commande');
    expect(titreNouvelleCommande(undefined)).toBe('Nouvelle commande');
    expect(titreNouvelleCommande('   ')).toBe('Nouvelle commande');
  });
});

describe('scheduleOrderNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taches.length = 0;
    insertions = [];
    reponseInsert = { error: null };
    envoyerPush.mockResolvedValue({ envoyees: 1, expirees: 0, echecs: 0, refuses: 0 });
  });

  it('ecrit la notification dans l application ET envoie le push', async () => {
    scheduleOrderNotification(fausseBase(), PARAMS);
    await executerLesTaches();

    expect(insertions).toHaveLength(1);
    expect(envoyerPush).toHaveBeenCalledTimes(1);
  });

  it('affiche le montant en FCFA et non en code ISO', async () => {
    scheduleOrderNotification(fausseBase(), PARAMS);
    await executerLesTaches();

    expect(insertions[0].body).toMatch(/FCFA$/);
    expect(insertions[0].body).not.toContain('XOF');
  });

  it('les deux portent le meme texte', async () => {
    scheduleOrderNotification(fausseBase(), PARAMS);
    await executerLesTaches();

    const [, charge] = envoyerPush.mock.calls[0];
    expect(charge.titre).toBe(insertions[0].title);
    expect(charge.corps).toBe(insertions[0].body);
  });

  /**
   * Un tag par commande. Avec un tag commun, la table 7 effacait la table 4
   * sans aucun bruit et cette commande n'etait vue qu'au prochain passage en
   * cuisine - exactement le defaut que ce push est cense corriger.
   */
  it('donne un tag propre a chaque commande', async () => {
    scheduleOrderNotification(fausseBase(), PARAMS);
    scheduleOrderNotification(fausseBase(), { ...PARAMS, orderId: 'commande-2' });
    await executerLesTaches();

    const tags = envoyerPush.mock.calls.map((a) => a[1].tag);
    expect(new Set(tags).size).toBe(2);
  });

  /**
   * `/admin/orders` ecrit en dur ouvrait une 404: `src/app/admin/orders`
   * n'existe pas, et la connexion par defaut depose le personnel sur
   * attabl.com. L'envoyeur transmet le chemin DANS l'admin plus le slug; le
   * service worker prefixe selon son origine.
   */
  it('transmet un chemin relatif a l admin et le slug, pas un chemin en dur', async () => {
    scheduleOrderNotification(fausseBase(), PARAMS);
    await executerLesTaches();

    const [, charge] = envoyerPush.mock.calls[0];
    expect(charge.url).toBe('/orders');
    expect(charge.url).not.toContain('/admin');
    expect(charge.slug).toBe('mon-resto');
    // Et la notification dans l application utilise le MEME chemin: le centre
    // de notifications le prefixe de son cote.
    expect(insertions[0].link).toBe('/orders');
  });

  /**
   * Il ne suffit pas que l assainissement existe: il faut qu il soit APPELE
   * ici. Sans cette verification, remettre le texte brut du convive dans le
   * titre passait toute la suite au vert.
   */
  it('assainit le numero de table avant de l afficher au personnel', async () => {
    scheduleOrderNotification(fausseBase(), {
      ...PARAMS,
      tableNumber: 'URGENCE appelez le 70 00 00 00',
    });
    await executerLesTaches();

    const [, charge] = envoyerPush.mock.calls[0];
    expect(charge.titre).not.toContain('70 00 00 00');
    expect(charge.titre).toBe(titreNouvelleCommande('URGENCE appelez le 70 00 00 00'));
    // La notification dans l application porte le meme titre assaini: le
    // defaut existait deja pour elle avant que le push ne l amplifie.
    expect(insertions[0].title).toBe(charge.titre);
  });

  it('le push part meme si l ecriture en base echoue', async () => {
    reponseInsert = { error: { message: 'base indisponible' } };

    scheduleOrderNotification(fausseBase(), PARAMS);
    await executerLesTaches();

    expect(envoyerPush).toHaveBeenCalledTimes(1);
  });

  it('un push en panne ne fait pas echouer la tache', async () => {
    envoyerPush.mockRejectedValue(new Error('panne'));

    scheduleOrderNotification(fausseBase(), PARAMS);
    await expect(executerLesTaches()).resolves.toBeUndefined();
  });

  it('n envoie aucune donnee personnelle du convive', async () => {
    scheduleOrderNotification(fausseBase(), PARAMS);
    await executerLesTaches();

    const charge = JSON.stringify(envoyerPush.mock.calls[0][1]);
    expect(charge).not.toMatch(/customerName|customerPhone|deliveryAddress/i);
  });
});
