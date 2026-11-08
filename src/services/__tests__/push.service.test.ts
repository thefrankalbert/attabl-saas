import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createPushService } from '../push.service';

const envoyer = vi.hoisted(() => vi.fn());
const poserCles = vi.hoisted(() => vi.fn());

vi.mock('web-push', () => ({
  sendNotification: envoyer,
  setVapidDetails: poserCles,
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Ce que ces tests figent, et pourquoi chacun compte.
 *
 * Tout le circuit des notifications push existait et n'envoyait rien: le
 * restaurateur pouvait activer les alertes, voir le bouton passer a "activees",
 * et ne jamais en recevoir une seule. Deux proprietes doivent desormais tenir:
 *
 *   - une notification part VRAIMENT vers chaque appareil du restaurant, et
 *     d'aucun autre;
 *   - rien de ce service ne peut faire echouer la commande qui le declenche -
 *     ni des cles absentes, ni une base muette, ni un service de push qui
 *     refuse.
 */

interface Appel {
  table: string;
  colonnes?: string;
  filtresEq: [string, string][];
  filtreIn?: [string, string[]];
  optionsDelete?: unknown;
  type: 'select' | 'delete';
}

let appels: Appel[];
let reponseSelect: { data: unknown; error: unknown };
let reponseDelete: { count: number | null; error: unknown };

function fausseBase(): SupabaseClient {
  return {
    from: (table: string) => ({
      select: (colonnes: string) => {
        const appel: Appel = { table, colonnes, filtresEq: [], type: 'select' };
        appels.push(appel);
        return {
          eq: async (colonne: string, valeur: string) => {
            appel.filtresEq.push([colonne, valeur]);
            return reponseSelect;
          },
        };
      },
      delete: (options: unknown) => {
        const appel: Appel = { table, filtresEq: [], optionsDelete: options, type: 'delete' };
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
  tag: 'nouvelle-commande',
  url: '/admin/orders',
};

function abonnement(id: string) {
  return { id, endpoint: `https://push.example/${id}`, p256dh: `p-${id}`, auth: `a-${id}` };
}

class RefusDuService extends Error {
  constructor(readonly statusCode: number) {
    super(`refus ${statusCode}`);
  }
}

const CLE_PUBLIQUE_FACTICE = 'cle-publique-de-test';
const CLE_PRIVEE_FACTICE = 'cle-privee-de-test';

describe('createPushService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appels = [];
    reponseSelect = { data: [abonnement('un'), abonnement('deux')], error: null };
    reponseDelete = { count: 1, error: null };
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = CLE_PUBLIQUE_FACTICE;
    process.env.VAPID_PRIVATE_KEY = CLE_PRIVEE_FACTICE;
    envoyer.mockResolvedValue({ statusCode: 201 });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  // ==========================================================================
  // L'envoi atteint les appareils du bon restaurant
  // ==========================================================================
  it('envoie a chaque appareil enregistre du restaurant', async () => {
    const resultat = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(
      TENANT,
      CHARGE,
    );

    expect(envoyer).toHaveBeenCalledTimes(2);
    expect(resultat).toEqual({ envoyees: 2, expirees: 0, echecs: 0 });
  });

  it('ne lit que les abonnements de ce restaurant', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    const lecture = appels.find((a) => a.type === 'select')!;
    expect(lecture.table).toBe('push_subscriptions');
    expect(lecture.filtresEq).toEqual([['tenant_id', TENANT]]);
  });

  /**
   * Le service worker (`src/app/sw.ts`) lit `title`, `body`, `tag` et `url`, en
   * anglais. Renommer un seul de ces champs rend la notification muette ou sans
   * titre, et rien ne le signalerait a l'execution.
   */
  it('envoie exactement les champs que le service worker sait lire', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    const [abonnementEnvoye, corps] = envoyer.mock.calls[0];
    expect(abonnementEnvoye).toEqual({
      endpoint: 'https://push.example/un',
      keys: { p256dh: 'p-un', auth: 'a-un' },
    });
    expect(JSON.parse(corps as string)).toEqual({
      title: 'Nouvelle commande - Table 4',
      body: '3 articles - 12 500 XOF',
      tag: 'nouvelle-commande',
      url: '/admin/orders',
    });
  });

  it('declare un contact joignable au service de push (exigence VAPID)', async () => {
    await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE);

    expect(poserCles).toHaveBeenCalledWith(
      'mailto:contact@attabl.com',
      CLE_PUBLIQUE_FACTICE,
      CLE_PRIVEE_FACTICE,
    );
  });

  // ==========================================================================
  // Les appareils morts sont supprimes, pas reessayes a l'infini
  // ==========================================================================
  /**
   * Un 410 signifie "cet abonnement n'existe plus" (appareil reinitialise,
   * permission revoquee). Sans suppression, la table ne fait que grossir et
   * chaque commande paie une requete reseau pour un appareil mort.
   */
  it('supprime un abonnement que le service de push ne reconnait plus', async () => {
    envoyer.mockRejectedValueOnce(new RefusDuService(410));

    const resultat = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(
      TENANT,
      CHARGE,
    );

    expect(resultat).toEqual({ envoyees: 1, expirees: 1, echecs: 0 });
    const suppression = appels.find((a) => a.type === 'delete')!;
    expect(suppression.optionsDelete).toEqual({ count: 'exact' });
    expect(suppression.filtresEq).toEqual([['tenant_id', TENANT]]);
    expect(suppression.filtreIn).toEqual(['id', ['un']]);
  });

  it('supprime aussi sur un 404', async () => {
    envoyer.mockRejectedValueOnce(new RefusDuService(404));

    const resultat = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(
      TENANT,
      CHARGE,
    );

    expect(resultat.expirees).toBe(1);
  });

  /**
   * Une panne passagere du service de push (500) n'est PAS un abonnement mort:
   * supprimer la ligne desabonnerait un restaurateur a cause d'un incident chez
   * Google ou Apple, et il ne le saurait jamais.
   */
  it('ne supprime rien sur une panne passagere du service de push', async () => {
    envoyer.mockRejectedValueOnce(new RefusDuService(500));

    const resultat = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(
      TENANT,
      CHARGE,
    );

    expect(resultat).toEqual({ envoyees: 1, expirees: 0, echecs: 1 });
    expect(appels.find((a) => a.type === 'delete')).toBeUndefined();
  });

  it('ne supprime rien quand une erreur ne porte aucun code', async () => {
    envoyer.mockRejectedValueOnce(new Error('reseau coupe'));

    const resultat = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(
      TENANT,
      CHARGE,
    );

    expect(resultat).toEqual({ envoyees: 1, expirees: 0, echecs: 1 });
    expect(appels.find((a) => a.type === 'delete')).toBeUndefined();
  });

  // ==========================================================================
  // Rien ici ne peut faire echouer la commande qui le declenche
  // ==========================================================================
  it('sans cles VAPID, ne touche ni la base ni le reseau', async () => {
    delete process.env.VAPID_PRIVATE_KEY;

    const resultat = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(
      TENANT,
      CHARGE,
    );

    expect(resultat).toEqual({ envoyees: 0, expirees: 0, echecs: 0 });
    expect(appels).toHaveLength(0);
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('une base muette rend un compte rendu a zero au lieu de lever', async () => {
    reponseSelect = { data: null, error: { message: 'base indisponible' } };

    await expect(
      createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE),
    ).resolves.toEqual({ envoyees: 0, expirees: 0, echecs: 0 });
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('aucun appareil abonne: aucun appel reseau', async () => {
    reponseSelect = { data: [], error: null };

    const resultat = await createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(
      TENANT,
      CHARGE,
    );

    expect(resultat).toEqual({ envoyees: 0, expirees: 0, echecs: 0 });
    expect(envoyer).not.toHaveBeenCalled();
    expect(poserCles).not.toHaveBeenCalled();
  });

  it('un nettoyage qui echoue ne fait pas lever l envoi', async () => {
    envoyer.mockRejectedValueOnce(new RefusDuService(410));
    reponseDelete = { count: null, error: { message: 'base indisponible' } };

    await expect(
      createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE),
    ).resolves.toEqual({ envoyees: 1, expirees: 1, echecs: 0 });
  });

  it('tous les appareils refusent: toujours pas de levee', async () => {
    envoyer.mockRejectedValue(new RefusDuService(500));

    await expect(
      createPushService(fausseBase()).envoyerAuxAppareilsDuTenant(TENANT, CHARGE),
    ).resolves.toEqual({ envoyees: 0, expirees: 0, echecs: 2 });
  });
});
