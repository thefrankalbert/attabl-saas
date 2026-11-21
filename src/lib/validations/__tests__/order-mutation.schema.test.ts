import { describe, it, expect } from 'vitest';
import { orderMutationSchema } from '../order-mutation.schema';

/**
 * Encaissement par la file hors ligne (type 'pay'). Contre-verification du
 * 2026-11-21: le moyen de paiement etait un texte libre de 50 caracteres. Un
 * moyen inconnu n'etait refuse que par la base (23514), apres son entree dans
 * la file. Il suit maintenant la meme liste que la contrainte de la base.
 */
const base = {
  type: 'pay' as const,
  client_request_id: '11111111-1111-4111-a111-111111111111',
  orderId: '22222222-2222-4222-a222-222222222222',
};

describe('orderMutationSchema - encaissement', () => {
  it.each(['cash', 'card', 'wave', 'orange_money', 'mtn_momo', 'free_money'])(
    'accepte le moyen connu %s',
    (method) => {
      expect(orderMutationSchema.safeParse({ ...base, method }).success).toBe(true);
    },
  );

  it.each(['bitcoin', '', 'CASH'])('refuse le moyen inconnu %j', (method) => {
    expect(orderMutationSchema.safeParse({ ...base, method }).success).toBe(false);
  });

  it('borne le pourboire ajoute (entier, plafond grossier)', () => {
    expect(orderMutationSchema.safeParse({ ...base, method: 'cash', tipMinor: 12.5 }).success).toBe(
      false,
    );
    expect(
      orderMutationSchema.safeParse({ ...base, method: 'cash', tipMinor: 100_000_001 }).success,
    ).toBe(false);
  });
});
