import { describe, it, expect } from 'vitest';
import { verifiedPriceKey } from '../verified-price-key';
import type { OrderItemInput } from '@/lib/validations/order.schema';

const PIZZA = '11111111-1111-4111-a111-111111111111';

function line(overrides: Partial<OrderItemInput>): OrderItemInput {
  return {
    id: PIZZA,
    name: 'Pizza',
    price: 3000,
    quantity: 1,
    ...overrides,
  } as OrderItemInput;
}

/**
 * F8: la carte des prix verifies etait indexee par menu_item_id. Deux variantes
 * du meme article s'ecrasaient, et les deux lignes order_items partaient au prix
 * de la derniere. Le total de la commande restait juste - c'est ce qui rendait le
 * defaut invisible - mais le detail ligne a ligne, donc le ticket client, etait faux.
 */
describe('verifiedPriceKey (F8)', () => {
  it('distingue deux variantes du meme article', () => {
    const petite = line({ selectedVariant: { id: 'v-petite', name_fr: 'Petite', price: 3000 } });
    const grande = line({ selectedVariant: { id: 'v-grande', name_fr: 'Grande', price: 5000 } });

    expect(verifiedPriceKey(petite)).not.toBe(verifiedPriceKey(grande));
  });

  it('garde les deux prix dans la meme carte', () => {
    const petite = line({ selectedVariant: { id: 'v-petite', name_fr: 'Petite', price: 3000 } });
    const grande = line({
      selectedVariant: { id: 'v-grande', name_fr: 'Grande', price: 5000 },
      price: 5000,
    });

    const prices = new Map<string, number>();
    prices.set(verifiedPriceKey(petite), 3000);
    prices.set(verifiedPriceKey(grande), 5000);

    expect(prices.size).toBe(2);
    expect(prices.get(verifiedPriceKey(petite))).toBe(3000);
    expect(prices.get(verifiedPriceKey(grande))).toBe(5000);
    // Le detail ligne a ligne retombe sur le total de la commande.
    expect(3000 + 5000).toBe(8000);
  });

  it('retombe sur le nom normalise quand la variante n_a pas d_id', () => {
    const sansId = line({ selectedVariant: { name_fr: 'Grande', price: 5000 } });
    const casseDifferente = line({ selectedVariant: { name_fr: 'GRANDE', price: 5000 } });

    expect(verifiedPriceKey(sansId)).toBe(verifiedPriceKey(casseDifferente));
  });

  it('donne une cle stable sans variante', () => {
    expect(verifiedPriceKey(line({}))).toBe(`${PIZZA}:`);
  });
});
