import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { logger } from '@/lib/logger';
import {
  NOW,
  DAY,
  iso,
  payment,
  tenant,
  setup,
  tx,
  type Row,
} from './helpers/flutterwave-fixtures';

/**
 * Audit SM8: le rapprochement relit chez Flutterwave les paiements deja
 * regles et inscrit chaque ecart dans `flutterwave_anomalies`, sans toucher a
 * aucun abonnement.
 */

describe('SM8: rapprochement des paiements deja regles', () => {
  const regle = (overrides: Row = {}) =>
    payment({
      status: 'successful',
      flw_transaction_id: 7001,
      period_end: iso(20 * DAY),
      ...overrides,
    });

  it('TEMOIN NEGATIF: tout concorde (transaction confirmee, restaurant actif): aucune anomalie', async () => {
    const s = setup({ payments: [regle()] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    expect(await s.reconciliation.reconcileSettled()).toEqual({
      settledChecked: 1,
      anomalies: 0,
      settledErrors: 0,
    });
    expect(s.anomalies()).toHaveLength(0);
    expect(s.client.verifyTransaction).toHaveBeenCalledWith(7001);
  });

  it('Flutterwave ne confirme plus la transaction (annulee): provider_mismatch', async () => {
    const s = setup({ payments: [regle()] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001, status: 'reversed' }));
    expect((await s.reconciliation.reconcileSettled()).anomalies).toBe(1);
    expect(s.anomalies()).toEqual([
      expect.objectContaining({
        kind: 'provider_mismatch',
        reason: 'statut reversed',
        flw_transaction_id: 7001,
      }),
    ]);
  });

  it('periode payee en cours mais restaurant gele: paid_period_not_active', async () => {
    const s = setup({
      payments: [regle()],
      tenants: [tenant({ subscription_status: 'frozen' })],
    });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    await s.reconciliation.reconcileSettled();
    expect(s.anomalies()).toEqual([
      expect.objectContaining({ kind: 'paid_period_not_active', reason: 'restaurant frozen' }),
    ]);
  });

  it('TEMOIN NEGATIF: periode payee deja ECHUE, restaurant gele: pas d anomalie de periode', async () => {
    const s = setup({
      payments: [regle({ period_end: iso(-DAY) })],
      tenants: [tenant({ subscription_status: 'frozen' })],
    });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    await s.reconciliation.reconcileSettled();
    expect(s.anomalies()).toHaveLength(0);
  });

  it('double paiement dont le webhook s est perdu: retrouve par la liste, ligne refund_due', async () => {
    const s = setup({ payments: [regle()] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    vi.mocked(s.client.listTransactionsByReference).mockResolvedValue([
      tx({ id: 7001 }),
      tx({ id: 7009 }),
      tx({ id: 7010, status: 'failed' }),
    ]);
    expect((await s.reconciliation.reconcileSettled()).anomalies).toBe(1);
    expect(s.anomalies()).toEqual([
      expect.objectContaining({
        kind: 'refund_due',
        reason: 'ALREADY_SETTLED_BY_OTHER_TRANSACTION',
        flw_transaction_id: 7009,
        payment_id: 'pay-1',
      }),
    ]);
  });

  it('un ecart deja inscrit n est pas recompte au passage suivant (pas d alerte en boucle)', async () => {
    const s = setup({ payments: [regle()] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001, status: 'reversed' }));
    expect((await s.reconciliation.reconcileSettled()).anomalies).toBe(1);
    expect((await s.reconciliation.reconcileSettled()).anomalies).toBe(0);
    expect(s.anomalies()).toHaveLength(1);
  });

  it('ne relit ni les tentatives pending ni les paiements de plus de 30 jours', async () => {
    const s = setup({
      payments: [
        payment({ id: 'p-pending' }),
        regle({
          id: 'p-vieux',
          tx_ref: 'atb_vieux',
          flw_transaction_id: 6000,
          created_at: iso(-31 * DAY),
        }),
      ],
    });
    expect((await s.reconciliation.reconcileSettled()).settledChecked).toBe(0);
    expect(s.client.verifyTransaction).not.toHaveBeenCalled();
  });

  it('les paiements REFUSES sont relus aussi (double paiement sur une tentative refusee)', async () => {
    const s = setup({ payments: [regle({ status: 'rejected_conflict', period_end: null })] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    vi.mocked(s.client.listTransactionsByReference).mockResolvedValue([tx({ id: 7020 })]);
    await s.reconciliation.reconcileSettled();
    expect(s.anomalies()).toEqual([expect.objectContaining({ flw_transaction_id: 7020 })]);
  });

  it('une panne Flutterwave sur une ligne est comptee et n arrete pas les suivantes; chaque ligne est marquee', async () => {
    const s = setup({
      payments: [
        regle({ id: 'p1', tx_ref: 'atb_1', flw_transaction_id: 1 }),
        regle({ id: 'p2', tx_ref: 'atb_2', flw_transaction_id: 2 }),
      ],
    });
    vi.mocked(s.client.verifyTransaction)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(tx({ id: 2, tx_ref: 'atb_2' }));
    expect(await s.reconciliation.reconcileSettled()).toEqual({
      settledChecked: 2,
      anomalies: 0,
      settledErrors: 1,
    });
    expect(s.db.flutterwave_payments.every((r) => r.last_checked_at === NOW.toISOString())).toBe(
      true,
    );
  });

  it('alerte une seule fois par ecart: le double paiement est journalise au premier passage, pas au suivant', async () => {
    const s = setup({ payments: [regle()] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    vi.mocked(s.client.listTransactionsByReference).mockResolvedValue([tx({ id: 7009 })]);
    vi.mocked(logger.error).mockClear();

    await s.reconciliation.reconcileSettled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('remboursement a faire'),
      expect.objectContaining({ flwTransactionId: 7009, recordedFlwTransactionId: 7001 }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('nouveaux ecarts'),
      undefined,
      expect.objectContaining({ anomalies: 1 }),
    );

    vi.mocked(logger.error).mockClear();
    await s.reconciliation.reconcileSettled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
