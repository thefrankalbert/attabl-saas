import { describe, it, expect } from 'vitest';
import { remainingDueMinor } from '../usePosUnpaidOrders';

/**
 * Audit du 2026-11-10 (C-042): une note payee en partie disparaissait de la
 * liste "A encaisser". Elle y revient avec son SOLDE, pas son total: reclamer
 * le total a un client qui a deja verse un acompte, c'est le faire payer deux
 * fois.
 */
describe('remainingDueMinor', () => {
  it('retire l acompte du total', () => {
    expect(remainingDueMinor({ total: 1500 }, [{ amount: 500, status: 'completed' }])).toBe(1000);
  });

  it('compte le pourboire dans ce qui est du', () => {
    expect(
      remainingDueMinor({ total: 1500, tip_amount: 500 }, [{ amount: 500, status: 'completed' }]),
    ).toBe(1500);
  });

  it('remet au solde ce qui a ete rembourse', () => {
    const tenders = [
      { amount: 3500, status: 'completed' },
      { amount: 1000, status: 'refunded' },
    ];
    expect(remainingDueMinor({ total: 3500 }, tenders)).toBe(1000);
  });

  it('ignore un paiement qui n a pas abouti', () => {
    expect(remainingDueMinor({ total: 1500 }, [{ amount: 1500, status: 'failed' }])).toBe(1500);
  });

  it('ne reclame jamais un montant negatif', () => {
    expect(remainingDueMinor({ total: 1500 }, [{ amount: 2000, status: 'completed' }])).toBe(0);
  });

  it('reclame tout quand rien n est entre au registre', () => {
    expect(remainingDueMinor({ total: 1500 }, [])).toBe(1500);
  });
});
