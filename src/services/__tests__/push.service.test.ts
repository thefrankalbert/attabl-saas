import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createPushService } from '../push.service';

const envoyer = vi.hoisted(() => vi.fn());
const poserCles = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('web-push', () => ({ sendNotification: envoyer, setVapidDetails: poserCles }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Ce que ces tests figent, et pourquoi chacun compte.
 *
 * Tout le circuit des notifications push existait et n'envoyait rien. Ce
 * service est le PREMIER code qui lit `push_subscriptions` et qui appelle les
 * URL qui y sont stockees: il arme donc trois defauts restes inertes tant que
 * personne n'envoyait. Les proprietes a tenir ensemble:
 *
 *   - la notification part vers les appareils des membres VIVANTS de CE
 *     restaurant, et d'aucun autre (la policy RLS d'ecriture ne contraint que
 *     `user_id`, jamais `tenant_id`: une ligne usurpee ne doit rien recevoir);
 *   - aucune requete sortante vers une destination qui n'est pas un service de
 *     push connu;
 *   - rien ici ne peut faire echouer l'action metier qui le declenche;
 *   - le compte rendu ne ment pas: une suppression annoncee a eu lieu.
 */

interface Appel {
  table: string;
  type: 'select' | 'delete';
  filtresEq: [string, string][];
  filtresIs?: [string, null][];
  filtreIn?: [string, string[]];
  limite?: number;
  optionsDelete?: unknown;
}

let appels: Appel[];
let reponseMembres: { data: unknown; error: unknown };
let reponseAbonnements: { data: unknown; error: unknown };
let reponseDelete: { count: number | null; error: unknown };

function fausseBase(): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => {
        const appel: Appel = { table, type: 'select', filtresEq: [], filtresIs: [] };
        appels.push(appel);
        const reponse = table === 'admin_users' ? () => reponseMembres : () => reponseAbonnements;
        const chaine = {
          eq: (colonne: string, valeur: string) => {
            appel.filtresEq.push([colonne, valeur]);
            return chaine;
          },
          is: (colonne: string, valeur: null) => {
            appel.filtresIs!.push([colonne, valeur]);
            return chaine;
          },
          in: (colonne: string, valeurs: string[]) => {
            appel.filtreIn = [colonne, valeurs];
            return chaine;
          },
          limit: (n: number) => {
            appel.limite = n;
            return chaine;
          },
          then: (resoudre: (v: unknown) => unknown) => Promise.resolve(reponse()).then(resoudre),
        };
        return chaine;
      },
      delete: (options: unknown) => {
        const appel: Appel = { table, type: 'delete', filtresEq: [], optionsDelete: options };
        appels.push(appel);
        const chaine = {
          eq: (colonne: string, valeur: string) => {
            appel.filtresEq.push([colonne, valeur]);
            return chaine;
          },
          in: async (colonne: string, valeurs: string[]) => {
            appel.filtreIn = [colonne, valeurs];
            return reponseDelete;
          },
        };
        return chaine;
      },
    }),
  } as unknown as SupabaseClient;
}

const TENANT = 'tenant-a';
const CHARGE = {
  titre: 'Nouvelle commande - Table 4',
  corps: '3 articles - 12 500 XOF',
  tag: 'commande-o-1',
  url: '/orders',
  slug: 'mon-resto',
};

/**
 * De VRAIES cles au format VAPID: 65 octets pour la publique, 32 pour la
 * privee, en base64 URL-safe. L'ancienne version de ces tests utilisait
 * 'cle-de-test', que la vraie bibliotheque REFUSE - le test passait donc en
 * verifiant seulement que le mock avait ete appele.
 */
const CLE_PUBLIQUE = Buffer.alloc(65, 1).toString('base64url');
const CLE_PRIVEE = Buffer.alloc(32, 2).toString('base64url');

function abonnement(id: string, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`) {
  return { id, endpoint, p256dh: `p-${id}`, auth: `a-${id}` };
}

class RefusDuService extends Error {
  constructor(readonly statusCode: number) {
    super(`refus ${statusCode}`);
  }
}

describe('createPushService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appels = [];
    reponseMembres = { data: [{ user_id: 'u-1' }, { user_id: 'u-2' }], error: null };
    reponseAbonnements = { data: [abonnement('un'), abonnement('deux')], error: null };
    reponseDelete = { count: 1, error: null };
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = CLE_PUBLIQUE;
    process.env.VAPID_PRIVATE_KEY = CLE_PRIVEE;
    envoyer.mockResolvedValue({ statusCode: 201 });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  const lecture = (table: string) => appels.find((a) => a.type === 'select' && a.table === table)!;
  const suppression = () => appels.find((a) => a.type === 'delete');

  // ==========================================================================
  // Les destinataires: membres vivants de CE restaurant, et personne d autre
  // ==========================================================================
  it('envoie a chaque appareil enregistre', async () => {
    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(envoyer).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ envoyees: 2, expirees: 0, echecs: 0, refuses: 0 });
  });

  /**
   * Un employe retire garde son abonnement: rien dans le depot ne le supprime.
   * Sans ce filtre, son telephone personnel continuerait de recevoir chaque
   * commande du restaurant - table, articles, montant - indefiniment.
   */
  it('ne retient que les membres vivants du restaurant', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    const membres = lecture('admin_users');
    expect(membres.filtresEq).toEqual([
      ['tenant_id', TENANT],
      ['is_active', true as unknown as string],
    ]);
    expect(membres.filtresIs).toEqual([['deleted_at', null]]);
  });

  /**
   * La policy RLS d'ecriture ne contraint que `user_id`: n'importe quel compte
   * pouvait inserer une ligne sous le `tenant_id` d'un autre restaurant. Le
   * filtre par appartenance fait qu'une telle ligne ne recoit rien.
   */
  it('ne contacte que les appareils des membres, et de ce restaurant', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    const abonnements = lecture('push_subscriptions');
    expect(abonnements.filtresEq).toEqual([['tenant_id', TENANT]]);
    expect(abonnements.filtreIn).toEqual(['user_id', ['u-1', 'u-2']]);
  });

  it('aucun membre vivant: aucun envoi, et on ne lit meme pas les abonnements', async () => {
    reponseMembres = { data: [], error: null };

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(r.envoyees).toBe(0);
    expect(appels.find((a) => a.table === 'push_subscriptions')).toBeUndefined();
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('plafonne le nombre d appareils contactes par envoi', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);
    expect(lecture('push_subscriptions').limite).toBe(100);
  });

  // ==========================================================================
  // Les destinations: rien hors des services de push connus
  // ==========================================================================
  /**
   * L'`endpoint` est une URL que NOUS appelons. Sans liste fermee, un compte
   * pouvait faire frapper nos serveurs sur une cible interne de son choix et
   * declencher l'envoi en passant une commande.
   */
  it('n appelle jamais une destination hors des services de push', async () => {
    reponseAbonnements = {
      data: [
        abonnement('interne', 'http://169.254.169.254/latest/meta-data/'),
        abonnement('legitime'),
      ],
      error: null,
    };

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(envoyer).toHaveBeenCalledTimes(1);
    expect((envoyer.mock.calls[0][0] as { endpoint: string }).endpoint).toContain(
      'fcm.googleapis.com',
    );
    expect(r).toEqual({ envoyees: 1, expirees: 0, echecs: 0, refuses: 1 });
  });

  it('une destination refusee n est PAS supprimee: c est notre regle, pas un refus du service', async () => {
    reponseAbonnements = {
      data: [abonnement('interne', 'http://127.0.0.1:5432/')],
      error: null,
    };

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(r.refuses).toBe(1);
    expect(suppression()).toBeUndefined();
    expect(poserCles).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // La charge: exactement ce que le service worker sait lire
  // ==========================================================================
  it('envoie exactement les champs que le service worker sait lire', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    const [abonnementEnvoye, corps] = envoyer.mock.calls[0];
    expect(abonnementEnvoye).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/un',
      keys: { p256dh: 'p-un', auth: 'a-un' },
    });
    expect(JSON.parse(corps as string)).toEqual({
      title: 'Nouvelle commande - Table 4',
      body: '3 articles - 12 500 XOF',
      tag: 'commande-o-1',
      url: '/orders',
      slug: 'mon-resto',
    });
  });

  /**
   * Le slug est indispensable: selon que le personnel s'est connecte sur
   * attabl.com ou sur <slug>.attabl.com, la page admin n'a pas le meme chemin.
   * Sans lui, le clic ouvrait une 404.
   */
  it('transmet le slug du restaurant, sans quoi le clic ouvre une 404', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);
    expect(JSON.parse(envoyer.mock.calls[0][1] as string).slug).toBe('mon-resto');
  });

  /** web-push n arme aucun delai: une socket qui pend tiendrait la fonction. */
  it('arme un delai de garde, une duree de vie et une urgence', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);
    expect(envoyer.mock.calls[0][2]).toEqual({ timeout: 10_000, TTL: 1_800, urgency: 'high' });
  });

  it('declare un contact joignable au service de push (exigence VAPID)', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);
    expect(poserCles).toHaveBeenCalledWith('mailto:contact@attabl.com', CLE_PUBLIQUE, CLE_PRIVEE);
  });

  // ==========================================================================
  // Les appareils morts, et seulement eux
  // ==========================================================================
  it('supprime un abonnement que le service de push ne reconnait plus (410)', async () => {
    envoyer.mockRejectedValueOnce(new RefusDuService(410));

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(r).toEqual({ envoyees: 1, expirees: 1, echecs: 0, refuses: 0 });
    const s = suppression()!;
    expect(s.optionsDelete).toEqual({ count: 'exact' });
    expect(s.filtresEq).toEqual([['tenant_id', TENANT]]);
    expect(s.filtreIn).toEqual(['id', ['un']]);
  });

  it('supprime aussi sur un 404', async () => {
    envoyer.mockRejectedValueOnce(new RefusDuService(404));
    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);
    expect(r.expirees).toBe(1);
  });

  /**
   * Un 500 ou un 401 n'est PAS un appareil mort: supprimer desabonnerait un
   * restaurateur a cause d'un incident chez Google ou d'une rotation de cles,
   * et il ne le saurait jamais.
   */
  it.each([500, 401, 403, 429])('ne supprime rien sur un %i', async (code) => {
    envoyer.mockRejectedValueOnce(new RefusDuService(code));

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(r).toEqual({ envoyees: 1, expirees: 0, echecs: 1, refuses: 0 });
    expect(suppression()).toBeUndefined();
  });

  it('ne supprime rien quand l erreur ne porte aucun code', async () => {
    envoyer.mockRejectedValueOnce(new Error('reseau coupe'));
    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);
    expect(r).toEqual({ envoyees: 1, expirees: 0, echecs: 1, refuses: 0 });
  });

  // ==========================================================================
  // Le compte rendu ne ment pas
  // ==========================================================================
  /**
   * L'ancienne version annoncait `expirees: 1` meme quand le DELETE avait
   * echoue: le compte rendu affirmait des suppressions qui n'avaient pas eu
   * lieu, et un test figeait ce mensonge.
   */
  it('n annonce aucune suppression quand le nettoyage a echoue', async () => {
    envoyer.mockRejectedValueOnce(new RefusDuService(410));
    reponseDelete = { count: null, error: { message: 'base indisponible' } };

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(r).toEqual({ envoyees: 1, expirees: 0, echecs: 0, refuses: 0 });
  });

  it('n annonce que les suppressions reellement faites', async () => {
    envoyer.mockRejectedValue(new RefusDuService(410));
    reponseDelete = { count: 1, error: null }; // la base n en a supprime qu une sur deux

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(r.expirees).toBe(1);
  });

  // ==========================================================================
  // Rien ici ne peut faire echouer l action metier
  // ==========================================================================
  it('sans cles VAPID, ne touche ni la base ni le reseau', async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(r).toEqual({ envoyees: 0, expirees: 0, echecs: 0, refuses: 0 });
    expect(appels).toHaveLength(0);
    expect(envoyer).not.toHaveBeenCalled();
  });

  /**
   * `setVapidDetails` LEVE sur une cle mal formee (base64 avec '=', cles
   * inversees, valeur tronquee au copier-coller). Le service promettait de ne
   * jamais lever: on valide donc le format avant, et on le dit dans le journal.
   */
  it.each([
    ['base64 avec padding', `${Buffer.alloc(65, 1).toString('base64')}`, CLE_PRIVEE],
    ['cles inversees', CLE_PRIVEE, CLE_PUBLIQUE],
    ['publique tronquee', Buffer.alloc(30, 1).toString('base64url'), CLE_PRIVEE],
    ['privee tronquee', CLE_PUBLIQUE, Buffer.alloc(10, 2).toString('base64url')],
  ])('cles mal formees (%s): aucun envoi, aucune levee', async (_cas, pub, priv) => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = pub;
    process.env.VAPID_PRIVATE_KEY = priv;

    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(r).toEqual({ envoyees: 0, expirees: 0, echecs: 0, refuses: 0 });
    expect(appels).toHaveLength(0);
    expect(poserCles).not.toHaveBeenCalled();
  });

  it('une base muette sur les membres rend un compte rendu a zero', async () => {
    reponseMembres = { data: null, error: { message: 'base indisponible' } };
    await expect(
      createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE),
    ).resolves.toEqual({ envoyees: 0, expirees: 0, echecs: 0, refuses: 0 });
  });

  it('une base muette sur les abonnements rend un compte rendu a zero', async () => {
    reponseAbonnements = { data: null, error: { message: 'base indisponible' } };
    await expect(
      createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE),
    ).resolves.toEqual({ envoyees: 0, expirees: 0, echecs: 0, refuses: 0 });
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('aucun appareil abonne: aucun appel reseau', async () => {
    reponseAbonnements = { data: [], error: null };
    const r = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);
    expect(r.envoyees).toBe(0);
    expect(poserCles).not.toHaveBeenCalled();
  });

  /** Garantie annoncee par le service: tenue meme sur une panne imprevue. */
  it('ne leve jamais, meme si la bibliotheque de push explose', async () => {
    poserCles.mockImplementationOnce(() => {
      throw new Error('panne interne de la bibliotheque');
    });

    await expect(
      createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE),
    ).resolves.toEqual({ envoyees: 0, expirees: 0, echecs: 0, refuses: 0 });
  });

  it('tous les appareils refusent: toujours pas de levee', async () => {
    envoyer.mockRejectedValue(new RefusDuService(500));
    await expect(
      createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE),
    ).resolves.toEqual({ envoyees: 0, expirees: 0, echecs: 2, refuses: 0 });
  });
});
