import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createRetentionService, RETENTION_JOURS } from '../retention.service';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * Ce que ces tests figent, et pourquoi chacun compte.
 *
 * La politique de confidentialite comptait six sections et aucune ne parlait de
 * duree de conservation; rien n'effacait quoi que ce soit. Deux proprietes
 * doivent desormais tenir ensemble, et se tromper sur l'une annule l'autre:
 *
 *   - les donnees qui identifient un convive disparaissent passe le delai;
 *   - la COMMANDE, elle, reste - c'est une piece comptable que le droit
 *     commercial impose de garder des annees.
 *
 * Donc on verifie aussi ce qui n'est PAS fait: aucune suppression de commande,
 * et aucun montant touche.
 */

interface AppelOrders {
  table: string;
  payload: Record<string, unknown>;
  filtreDate?: string;
  filtreOr?: string;
}

let appelsOrders: AppelOrders[];
let reponseOrders: { data: { id: string }[] | null; error: unknown };
let reponseSessions: { count: number | null; error: unknown };
let suppressions: { table: string; options: unknown; filtreDate?: string }[];

function fausseBase(): SupabaseClient {
  return {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        const appel: AppelOrders = { table, payload };
        appelsOrders.push(appel);
        const chaine = {
          lt: (_colonne: string, valeur: string) => {
            appel.filtreDate = valeur;
            return chaine;
          },
          or: (expression: string) => {
            appel.filtreOr = expression;
            return chaine;
          },
          select: async () => reponseOrders,
        };
        return chaine;
      },
      delete: (options: unknown) => {
        const appel = { table, options } as (typeof suppressions)[number];
        suppressions.push(appel);
        return {
          lt: async (_colonne: string, valeur: string) => {
            appel.filtreDate = valeur;
            return reponseSessions;
          },
        };
      },
    }),
  } as unknown as SupabaseClient;
}

const LE_15_MAI = new Date('2026-05-15T10:00:00.000Z');

describe('createRetentionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appelsOrders = [];
    suppressions = [];
    reponseOrders = { data: [{ id: 'o-1' }, { id: 'o-2' }], error: null };
    reponseSessions = { count: 3, error: null };
  });

  it('la duree annoncee est de 90 jours', () => {
    // Cette valeur est aussi du texte public (section 7 de la politique de
    // confidentialite). Si elle change, le texte doit changer avec elle.
    expect(RETENTION_JOURS).toBe(90);
  });

  it('vide les trois colonnes qui identifient une personne, et rien d autre', async () => {
    await createRetentionService(fausseBase()).anonymiserCommandesAnciennes(LE_15_MAI);

    const appel = appelsOrders.find((a) => a.table === 'orders')!;
    expect(appel.payload).toEqual({
      customer_name: null,
      customer_phone: null,
      delivery_address: null,
    });
    // La piece comptable reste intacte: aucun montant, aucune date, aucun numero.
    for (const interdit of ['total', 'subtotal', 'tax_amount', 'order_number', 'created_at']) {
      expect(appel.payload).not.toHaveProperty(interdit);
    }
  });

  it('ne touche que les commandes passees le delai', async () => {
    await createRetentionService(fausseBase()).anonymiserCommandesAnciennes(LE_15_MAI);

    const appel = appelsOrders.find((a) => a.table === 'orders')!;
    // 90 jours avant le 15 mai 2026 = 14 fevrier 2026.
    expect(appel.filtreDate).toBe('2026-02-14T10:00:00.000Z');
  });

  /**
   * Sans ce filtre, chaque passage reecrirait TOUTES les commandes anciennes:
   * la table gonflerait pour rien et le compte rendu annoncerait des centaines
   * d'anonymisations chaque nuit, donc un chiffre faux.
   */
  it('ne reecrit que les lignes qui portent encore une donnee', async () => {
    await createRetentionService(fausseBase()).anonymiserCommandesAnciennes(LE_15_MAI);

    const appel = appelsOrders.find((a) => a.table === 'orders')!;
    expect(appel.filtreOr).toBe(
      'customer_name.not.is.null,customer_phone.not.is.null,delivery_address.not.is.null',
    );
  });

  it('rend le nombre de commandes reellement anonymisees', async () => {
    const n = await createRetentionService(fausseBase()).anonymiserCommandesAnciennes(LE_15_MAI);
    expect(n).toBe(2);
  });

  it('ne supprime AUCUNE commande', async () => {
    await createRetentionService(fausseBase()).executer(LE_15_MAI);
    expect(suppressions.find((s) => s.table === 'orders')).toBeUndefined();
  });

  /**
   * PostgREST ne leve aucune erreur quand un DELETE ne touche rien: sans
   * `count: 'exact'`, le journal enregistrerait des suppressions fantomes.
   */
  it('compte exactement les sessions supprimees', async () => {
    const n = await createRetentionService(fausseBase()).purgerSessionsAnciennes(LE_15_MAI);

    expect(n).toBe(3);
    const appel = suppressions.find((s) => s.table === 'user_sessions')!;
    expect(appel.options).toEqual({ count: 'exact' });
    expect(appel.filtreDate).toBe('2026-02-14T10:00:00.000Z');
  });

  it('un compte absent est lu comme zero, pas comme un succes silencieux', async () => {
    reponseSessions = { count: null, error: null };
    const n = await createRetentionService(fausseBase()).purgerSessionsAnciennes(LE_15_MAI);
    expect(n).toBe(0);
  });

  // ==========================================================================
  // Les erreurs: une obligation qui echoue ne doit pas emporter l'autre
  // ==========================================================================
  it('une erreur sur les commandes laisse la purge des sessions se faire', async () => {
    reponseOrders = { data: null, error: { message: 'base indisponible' } };

    const resultat = await createRetentionService(fausseBase()).executer(LE_15_MAI);

    expect(resultat.commandesAnonymisees).toBe(0);
    expect(resultat.sessionsSupprimees).toBe(3);
  });

  it('une erreur sur les sessions laisse l anonymisation des commandes se faire', async () => {
    reponseSessions = { count: null, error: { message: 'base indisponible' } };

    const resultat = await createRetentionService(fausseBase()).executer(LE_15_MAI);

    expect(resultat.commandesAnonymisees).toBe(2);
    expect(resultat.sessionsSupprimees).toBe(0);
  });

  /**
   * `executer()` est appele depuis le cron de gel. S'il jetait, un restaurant
   * qui ne paie plus ne serait pas gele parce qu'une purge a echoue: deux
   * obligations distinctes, qui ne doivent pas se tenir par la main.
   */
  it('executer ne jette jamais, meme si les deux purges echouent', async () => {
    reponseOrders = { data: null, error: { message: 'panne' } };
    reponseSessions = { count: null, error: { message: 'panne' } };

    await expect(createRetentionService(fausseBase()).executer(LE_15_MAI)).resolves.toEqual({
      commandesAnonymisees: 0,
      sessionsSupprimees: 0,
    });
  });
});
