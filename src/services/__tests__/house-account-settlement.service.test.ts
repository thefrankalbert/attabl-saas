import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Audit du 2026-11-10 (C-054): "Solder" une ardoise ne faisait que changer une
 * etiquette. Ces tests figent que l'argent ENTRE AU REGISTRE avant la
 * fermeture, pour le reste du exact de chaque commande.
 */

const getSummary = vi.fn();
const recordTender = vi.fn();
const markSettled = vi.fn();

vi.mock('../payment.service', () => ({
  createPaymentService: () => ({ getSummary, recordTender }),
}));
vi.mock('../order-annotation.service', () => ({
  createOrderAnnotationService: () => ({ settleHouseAccount: markSettled }),
}));

import {
  createHouseAccountSettlementService,
  settlementRequestId,
} from '../house-account-settlement.service';

const TENANT = 'tenant-1';
const ACCOUNT = 'account-1';

/** Double minimal: une ligne d'ardoise, puis la liste de ses commandes. */
function client(opts: {
  account: { id: string; status: string } | null;
  orders?: Array<{ id: string }>;
}) {
  const filtres: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    const note = (op: string) =>
      vi.fn((col: string, val: unknown) => {
        filtres.push([table, `${op}:${col}`, val]);
        return chain;
      });
    chain.select = vi.fn(() => chain);
    chain.eq = note('eq');
    chain.neq = note('neq');
    chain.maybeSingle = vi.fn(async () => ({ data: opts.account, error: null }));
    // La liste des commandes se termine par `.in(...)`.
    chain.in = vi.fn(async (col: string, val: unknown) => {
      filtres.push([table, `in:${col}`, val]);
      return { data: opts.orders ?? [], error: null };
    });
    return chain;
  });
  return { supabase: { from } as unknown as SupabaseClient, filtres };
}

describe('house-account-settlement.service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('encaisse le reste du de chaque commande, puis ferme l ardoise', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'open' },
      orders: [{ id: 'o-1' }, { id: 'o-2' }],
    });
    getSummary
      .mockResolvedValueOnce({ due: 3500, net: 0, refunded: 0 })
      // Deja payee en partie: seul le reste est encaisse.
      .mockResolvedValueOnce({ due: 2000, net: 500, refunded: 0 });

    const resultat = await createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {
      settledBy: 'admin-9',
    });

    expect(recordTender).toHaveBeenNthCalledWith(1, 'o-1', TENANT, {
      amount: 3500,
      method: 'cash',
      createdBy: 'admin-9',
      clientRequestId: settlementRequestId(ACCOUNT, 'o-1'),
    });
    expect(recordTender).toHaveBeenNthCalledWith(2, 'o-2', TENANT, {
      amount: 1500,
      method: 'cash',
      createdBy: 'admin-9',
      clientRequestId: settlementRequestId(ACCOUNT, 'o-2'),
    });
    expect(resultat).toEqual({ orders: 2, collected: 5000 });
    expect(markSettled).toHaveBeenCalledWith(ACCOUNT, TENANT, { settledBy: 'admin-9' });
    // L'ordre compte: on ne ferme qu'apres avoir encaisse.
    expect(recordTender.mock.invocationCallOrder[1]).toBeLessThan(
      markSettled.mock.invocationCallOrder[0],
    );
  });

  it('ne cherche que les commandes de CETTE ardoise, de CE restaurant, encore dues', async () => {
    const { supabase, filtres } = client({ account: { id: ACCOUNT, status: 'open' } });

    await createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {});

    const commandes = filtres.filter(([table]) => table === 'orders');
    expect(commandes).toContainEqual(['orders', 'eq:tenant_id', TENANT]);
    expect(commandes).toContainEqual(['orders', 'eq:house_account_id', ACCOUNT]);
    expect(commandes).toContainEqual(['orders', 'neq:status', 'cancelled']);
    expect(commandes).toContainEqual(['orders', 'in:payment_status', ['pending', 'partial']]);
  });

  it('laisse l ardoise OUVERTE si un encaissement echoue', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'open' },
      orders: [{ id: 'o-1' }],
    });
    getSummary.mockResolvedValue({ due: 3500, net: 0, refunded: 0 });
    recordTender.mockRejectedValue(new Error('registre indisponible'));

    await expect(
      createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {}),
    ).rejects.toThrow('registre indisponible');
    expect(markSettled).not.toHaveBeenCalled();
  });

  it('ne re-encaisse pas une commande remboursee', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'open' },
      orders: [{ id: 'o-1' }],
    });
    // 3 500 encaisses puis 1 000 rendus: le reste apparent n'est pas une dette.
    getSummary.mockResolvedValue({ due: 3500, net: 2500, refunded: 1000 });

    const resultat = await createHouseAccountSettlementService(supabase).settle(
      ACCOUNT,
      TENANT,
      {},
    );

    expect(recordTender).not.toHaveBeenCalled();
    expect(resultat).toEqual({ orders: 0, collected: 0 });
  });

  it('donne a chaque couple ardoise-commande une cle stable, au format UUID', () => {
    const cle = settlementRequestId(ACCOUNT, 'o-1');

    // Stable: deux "Solder" simultanes presentent la meme cle a l'index unique.
    expect(settlementRequestId(ACCOUNT, 'o-1')).toBe(cle);
    expect(cle).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Temoin negatif: une autre commande ou une autre ardoise change la cle.
    expect(settlementRequestId(ACCOUNT, 'o-2')).not.toBe(cle);
    expect(settlementRequestId('autre-ardoise', 'o-1')).not.toBe(cle);
  });

  it('n encaisse rien une seconde fois sur une ardoise deja soldee', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'settled' },
      orders: [{ id: 'o-1' }],
    });

    const resultat = await createHouseAccountSettlementService(supabase).settle(
      ACCOUNT,
      TENANT,
      {},
    );

    expect(resultat).toEqual({ orders: 0, collected: 0 });
    expect(recordTender).not.toHaveBeenCalled();
    expect(markSettled).not.toHaveBeenCalled();
  });

  it('refuse une ardoise qui n appartient pas au restaurant', async () => {
    const { supabase } = client({ account: null });

    await expect(
      createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {}),
    ).rejects.toThrow('Ardoise introuvable');
    expect(recordTender).not.toHaveBeenCalled();
  });
});
