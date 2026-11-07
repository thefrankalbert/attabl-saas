import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

import { handleChargeRefunded } from '../refund';
import { ServiceError } from '../../errors';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

/**
 * Pourquoi ces tests. `charge.refunded` n'etait pas traite: un paiement
 * d'abonnement rembourse en ENTIER laissait l'acces intact. Le client
 * recuperait tout son argent et continuait d'etre servi.
 *
 * Les proprietes a figer sont autant des refus que des gels:
 *   - remboursement integral -> gel, avec la cause `refund`;
 *   - remboursement PARTIEL -> rien (geste commercial, prorata);
 *   - cause d'un gel deja en place -> jamais ecrasee;
 *   - ligne illisible -> gel SANS cause (on ne saute pas le gel, on
 *     n'invente pas une cause).
 */

type LigneTenant = {
  id: string;
  subscription_status: string | null;
  freeze_reason?: string | null;
};

let ligneTenant: LigneTenant | null;
let erreurLecture: unknown;
let erreurEcriture: unknown;
/** Ce qui a ete ecrit, et sur quel filtre. */
let ecritures: { payload: Record<string, unknown>; filtre: string }[];

function fausseBase() {
  return {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: ligneTenant, error: erreurLecture });
      chain.update = (payload: Record<string, unknown>) => ({
        eq: (colonne: string) => {
          ecritures.push({ payload, filtre: colonne });
          return Promise.resolve({ error: erreurEcriture });
        },
      });
      return chain;
    },
  };
}

function charge(overrides?: Partial<Stripe.Charge>): Stripe.Charge {
  return {
    id: 'ch_1',
    customer: 'cus_1',
    amount: 29000,
    amount_refunded: 29000,
    ...overrides,
  } as Stripe.Charge;
}

function deps() {
  return { supabase: fausseBase(), stripe: {} } as never;
}

describe('handleChargeRefunded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ligneTenant = { id: 't-1', subscription_status: 'active', freeze_reason: null };
    erreurLecture = null;
    erreurEcriture = null;
    ecritures = [];
  });

  it('remboursement integral: gele avec la cause refund', async () => {
    await handleChargeRefunded(deps(), charge());

    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].payload).toEqual({
      subscription_status: 'frozen',
      is_active: false,
      freeze_reason: 'refund',
    });
    expect(ecritures[0].filtre).toBe('id');
  });

  /** Un geste commercial ne doit pas couper un client qui a paye sa periode. */
  it.each([
    ['moitie', 14500],
    ['presque tout', 28999],
    ['rien', 0],
  ])('remboursement partiel (%s): ne touche a rien', async (_nom, rembourse) => {
    await handleChargeRefunded(deps(), charge({ amount_refunded: rembourse }));
    expect(ecritures).toHaveLength(0);
  });

  it('rembourse plus que le montant: traite comme integral', async () => {
    await handleChargeRefunded(deps(), charge({ amount: 1000, amount_refunded: 1200 }));
    expect(ecritures).toHaveLength(1);
  });

  it('client non resolvable: ne touche a rien', async () => {
    await handleChargeRefunded(deps(), charge({ customer: null }));
    expect(ecritures).toHaveLength(0);
  });

  it('client fourni comme objet: resolu par son id', async () => {
    await handleChargeRefunded(deps(), charge({ customer: { id: 'cus_obj' } as Stripe.Customer }));
    expect(ecritures).toHaveLength(1);
  });

  /**
   * Lecon CTR7-2: ecraser la cause transformerait un gel pour impaye en un gel
   * qu'un autre evenement aurait le droit de lever.
   */
  it.each(['past_due_overdue', 'dispute', 'stripe_unpaid', 'trial_expired'])(
    'tenant deja gele pour %s: cause conservee, acces re-affirme seulement',
    async (cause) => {
      ligneTenant = { id: 't-1', subscription_status: 'frozen', freeze_reason: cause };
      await handleChargeRefunded(deps(), charge());

      expect(ecritures).toHaveLength(1);
      expect(ecritures[0].payload).toEqual({ is_active: false });
      expect(ecritures[0].payload).not.toHaveProperty('freeze_reason');
    },
  );

  it('tenant gele SANS cause: la cause refund peut etre posee', async () => {
    // Un gel sans cause ne se leve pas tout seul: lui donner une cause le rend
    // au contraire reversible par une nouvelle souscription.
    ligneTenant = { id: 't-1', subscription_status: 'frozen', freeze_reason: null };
    await handleChargeRefunded(deps(), charge());

    expect(ecritures[0].payload).toMatchObject({ freeze_reason: 'refund' });
  });

  it('ligne illisible: gele quand meme, mais sans inventer de cause', async () => {
    ligneTenant = null;
    erreurLecture = { message: 'deux tenants pour ce client' };
    await handleChargeRefunded(deps(), charge());

    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].payload).toEqual({ subscription_status: 'frozen', is_active: false });
    // Faute de ligne lue, le filtre est le client Stripe.
    expect(ecritures[0].filtre).toBe('stripe_customer_id');
  });

  it('tenant inconnu: gele par filtre client, sans cause', async () => {
    ligneTenant = null;
    await handleChargeRefunded(deps(), charge());
    expect(ecritures[0].filtre).toBe('stripe_customer_id');
  });

  it('echec d ecriture: leve une ServiceError pour que Stripe retraite', async () => {
    erreurEcriture = { message: 'db down' };
    await expect(handleChargeRefunded(deps(), charge())).rejects.toBeInstanceOf(ServiceError);
  });
});
