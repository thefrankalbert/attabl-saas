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
    // La liste des commandes se termine par `.or(...)` (statut NULL compris).
    chain.or = vi.fn(async (expr: string) => {
      filtres.push([table, 'or', expr]);
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
    // Le registre relu apres chaque encaissement: tout est regle.
    recordTender
      .mockResolvedValueOnce({ due: 3500, net: 3500, refunded: 0 })
      .mockResolvedValueOnce({ due: 2000, net: 2000, refunded: 0 });

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
    // Meme population que get_house_account_balances: 'refunded' compris (B50),
    // et un statut NULL traite comme 'pending' (second contre-audit).
    expect(commandes).toContainEqual([
      'orders',
      'or',
      'payment_status.is.null,payment_status.in.(pending,partial,refunded)',
    ]);
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

  it('refuse de solder, sans rien encaisser, si une commande a ete remboursee en partie', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'open' },
      orders: [{ id: 'o-1' }],
    });
    // 3 500 encaisses puis 1 000 rendus: dette ou geste ? Un humain tranche.
    getSummary.mockResolvedValue({ due: 3500, net: 2500, refunded: 1000 });

    await expect(
      createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {}),
    ).rejects.toThrow(/remboursee/);
    // Le message ne renvoie plus vers "retirer de l ardoise": aucun ecran ne le
    // permet (actionDetachOrder etait sans appelant, revue L007 A5).
    await expect(
      createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {}),
    ).rejects.toThrow(
      "Une commande de cette ardoise a ete remboursee. Encaissez son reste ou annulez-la depuis sa fiche, puis soldez l'ardoise.",
    );
    expect(recordTender).not.toHaveBeenCalled();
    // L'ardoise ne se ferme jamais sur un solde non regle.
    expect(markSettled).not.toHaveBeenCalled();
  });

  // Contre-audit du lot A: une commande a 0 ne doit pas bloquer le solde, et
  // une commande remboursee EN TOTALITE ('refunded') suit la meme regle qu'un
  // remboursement partiel.
  it('commande a 0 (rien a encaisser): sautee, l ardoise se solde', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'open' },
      orders: [{ id: 'o-zero' }],
    });
    getSummary.mockResolvedValue({ due: 0, net: 0, refunded: 0 });

    await createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {});
    expect(recordTender).not.toHaveBeenCalled();
    expect(markSettled).toHaveBeenCalled();
  });

  it('commande remboursee en totalite: CONFLICT explicite, rien encaisse, ardoise ouverte', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'open' },
      orders: [{ id: 'o-rembourse' }],
    });
    // 3 500 encaisses puis 3 500 rendus: net 0, reste du 3 500 selon les soldes.
    getSummary.mockResolvedValue({ due: 3500, net: 0, refunded: 3500 });

    await expect(
      createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {}),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(recordTender).not.toHaveBeenCalled();
    expect(markSettled).not.toHaveBeenCalled();
  });

  it('laisse l ardoise ouverte si le registre montre encore un solde apres l encaissement', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'open' },
      orders: [{ id: 'o-1' }],
    });
    getSummary.mockResolvedValue({ due: 3500, net: 0, refunded: 0 });
    // La cle avait deja servi: aucun paiement n'est entre pour cette commande.
    recordTender.mockResolvedValue({ due: 3500, net: 0, refunded: 0 });

    await expect(
      createHouseAccountSettlementService(supabase).settle(ACCOUNT, TENANT, {}),
    ).rejects.toThrow(/reste ouverte/);
    expect(markSettled).not.toHaveBeenCalled();
  });

  it('accepte le rejeu d un double clic: le registre est deja solde, rien n est compte en double', async () => {
    const { supabase } = client({
      account: { id: ACCOUNT, status: 'open' },
      orders: [{ id: 'o-1' }],
    });
    // Les deux requetes ont lu 0 encaisse; l'autre a ecrit entre-temps.
    getSummary.mockResolvedValue({ due: 3500, net: 0, refunded: 0 });
    recordTender.mockResolvedValue({ due: 3500, net: 3500, refunded: 0 });

    const resultat = await createHouseAccountSettlementService(supabase).settle(
      ACCOUNT,
      TENANT,
      {},
    );

    expect(resultat).toEqual({ orders: 1, collected: 3500 });
    expect(markSettled).toHaveBeenCalledTimes(1);
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
