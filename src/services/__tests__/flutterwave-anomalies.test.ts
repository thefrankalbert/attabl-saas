import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { logger } from '@/lib/logger';
import { TENANT_A, REF, iso, DAY, payment, setup, tx } from './helpers/flutterwave-fixtures';

/**
 * Audit SM10: tout argent encaisse et NON applique laisse une ligne DURABLE
 * dans `flutterwave_anomalies` (et plus seulement un journal). Le rapprochement
 * (SM8) est teste dans flutterwave-reconciliation.service.test.ts; l'isolation
 * de la table (super admin et service seulement) en pgTAP:
 * supabase/tests/rls/flutterwave_anomalies.test.sql.
 */

describe('SM10: trace durable de l argent encaisse et non applique', () => {
  it('seconde transaction sur une reference deja reglee: une ligne refund_due, avec les deux montants identifies', async () => {
    const s = setup({ payments: [payment({ status: 'successful', flw_transaction_id: 7001 })] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7002 }));

    expect(await s.service.processTransaction(7002)).toEqual({
      kind: 'rejected',
      reason: 'ALREADY_SETTLED_BY_OTHER_TRANSACTION',
    });
    expect(s.anomalies()).toHaveLength(1);
    expect(s.anomalies()[0]).toMatchObject({
      kind: 'refund_due',
      reason: 'ALREADY_SETTLED_BY_OTHER_TRANSACTION',
      flw_transaction_id: 7002,
      tenant_id: TENANT_A,
      payment_id: 'pay-1',
      tx_ref: REF,
      amount: 79000,
      currency: 'XOF',
    });
  });

  it('webhook rejoue: toujours UNE seule ligne (idempotent)', async () => {
    const s = setup({ payments: [payment({ status: 'successful', flw_transaction_id: 7001 })] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7002 }));
    await s.service.processTransaction(7002);
    await s.service.processTransaction(7002);
    expect(s.anomalies()).toHaveLength(1);
  });

  it('TEMOIN NEGATIF: la MEME transaction rejouee (doublon ordinaire) n ecrit aucune anomalie', async () => {
    const s = setup({ payments: [payment({ status: 'successful', flw_transaction_id: 7001 })] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    expect(await s.service.processTransaction(7001)).toEqual({ kind: 'duplicate' });
    expect(s.anomalies()).toHaveLength(0);
  });

  it('TEMOIN NEGATIF: un paiement applique n ecrit aucune anomalie', async () => {
    const s = setup({
      rpc: () => ({ data: { outcome: 'applied', period_end: iso(30 * DAY) }, error: null }),
    });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    expect((await s.service.processTransaction(7001)).kind).toBe('applied');
    expect(s.anomalies()).toHaveLength(0);
  });

  it.each([
    ['rejected_conflict', 'STRIPE_CONFLICT'],
    ['rejected_blocked', 'TENANT_BLOCKED'],
    ['already_settled_by_other_transaction', 'ALREADY_SETTLED_BY_OTHER_TRANSACTION'],
    ['tenant_not_found', 'TENANT_NOT_FOUND'],
  ])('refus SQL %s: ligne refund_due raison %s', async (outcome, reason) => {
    const s = setup({ rpc: () => ({ data: { outcome }, error: null }) });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    expect(await s.service.processTransaction(7001)).toEqual({ kind: 'rejected', reason });
    expect(s.anomalies()).toEqual([expect.objectContaining({ kind: 'refund_due', reason })]);
  });

  it('sous-paiement et mauvaise devise: argent pris, ligne refund_due', async () => {
    const under = setup();
    vi.mocked(under.client.verifyTransaction).mockResolvedValue(tx({ id: 7001, amount: 1000 }));
    await under.service.processTransaction(7001);
    expect(under.anomalies()).toEqual([
      expect.objectContaining({ reason: 'AMOUNT_MISMATCH', amount: 1000 }),
    ]);

    const xaf = setup();
    vi.mocked(xaf.client.verifyTransaction).mockResolvedValue(tx({ id: 7001, currency: 'XAF' }));
    await xaf.service.processTransaction(7001);
    expect(xaf.anomalies()).toEqual([expect.objectContaining({ reason: 'CURRENCY_MISMATCH' })]);
  });

  it('alerte une seule fois: premier passage = error, rejeu du meme evenement = warn', async () => {
    const s = setup();
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001, amount: 1000 }));
    vi.mocked(logger.error).mockClear();
    vi.mocked(logger.warn).mockClear();
    const alerte = expect.stringContaining('remboursement a faire');

    await s.service.processTransaction(7001);
    expect(logger.error).toHaveBeenCalledWith(alerte, expect.anything());
    expect(logger.warn).not.toHaveBeenCalledWith(alerte, expect.anything());

    vi.mocked(logger.error).mockClear();
    await s.service.processTransaction(7001);
    expect(logger.error).not.toHaveBeenCalledWith(alerte, expect.anything());
    expect(logger.warn).toHaveBeenCalledWith(alerte, expect.objectContaining({ rejeu: true }));
    expect(s.anomalies()).toHaveLength(1);
  });

  it('reference ATTABL sans tentative en base: refund_due SANS restaurant (non cru)', async () => {
    const s = setup({ payments: [] });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    await s.service.processTransaction(7001);
    expect(s.anomalies()).toEqual([
      expect.objectContaining({ reason: 'UNKNOWN_TX_REF', tenant_id: null, payment_id: null }),
    ]);
  });

  it('TEMOIN NEGATIF: transaction non reussie, reference etrangere ou autre restaurant de session: aucune ligne', async () => {
    const failed = setup();
    vi.mocked(failed.client.verifyTransaction).mockResolvedValue(tx({ status: 'failed' }));
    await failed.service.processTransaction(7002);
    expect(failed.anomalies()).toHaveLength(0);

    const foreign = setup();
    vi.mocked(foreign.client.verifyTransaction).mockResolvedValue(tx({ tx_ref: 'boutique-9' }));
    await foreign.service.processTransaction(7002);
    expect(foreign.anomalies()).toHaveLength(0);

    const wrong = setup();
    vi.mocked(wrong.client.verifyTransaction).mockResolvedValue(tx());
    const other = '99999999-2222-3333-4444-555555555555';
    expect(await wrong.service.processTransaction(7002, other)).toEqual({
      kind: 'rejected',
      reason: 'WRONG_TENANT',
    });
    expect(wrong.anomalies()).toHaveLength(0);
  });

  it('ecriture de l anomalie impossible: ca LEVE (webhook en 500, Flutterwave relance)', async () => {
    const s = setup({
      payments: [payment({ status: 'successful', flw_transaction_id: 7001 })],
      anomalyWriteFails: true,
    });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7002 }));
    await expect(s.service.processTransaction(7002)).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('rejeu d une transaction deja REFUSEE en SQL: la ligne a rembourser est reaffirmee', async () => {
    const s = setup({
      payments: [payment({ status: 'rejected_conflict', flw_transaction_id: 7001 })],
    });
    vi.mocked(s.client.verifyTransaction).mockResolvedValue(tx({ id: 7001 }));
    expect(await s.service.processTransaction(7001)).toEqual({ kind: 'duplicate' });
    expect(s.anomalies()).toEqual([
      expect.objectContaining({ reason: 'STRIPE_CONFLICT', flw_transaction_id: 7001 }),
    ]);
  });
});
