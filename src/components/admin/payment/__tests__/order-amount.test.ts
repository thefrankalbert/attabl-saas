import { describe, it, expect } from 'vitest';

import { amountToCollectMajor } from '@/components/admin/payment/order-amount';
import type { CurrencyCode, Order } from '@/types/admin.types';

/**
 * Montant reclame au client a l'encaissement.
 *
 * Le defaut corrige: l'ecran ne lisait que `order.total_price`, un champ
 * derive que la liste des commandes ne remplit pas (la colonne de la base
 * s'appelle `total`). Une commande de 7 500 FCFA ouverte depuis cette liste
 * affichait "MONTANT A PAYER 0 FCFA", et la validation acceptait ce zero.
 */

const XOF: CurrencyCode = 'XOF';

function commande(champs: Partial<Order>): Pick<Order, 'id' | 'total_price' | 'total'> {
  return { id: 'o1', ...champs } as Pick<Order, 'id' | 'total_price' | 'total'>;
}

describe('amountToCollectMajor', () => {
  it('lit `total` quand l appelant n a pas mappe `total_price`', () => {
    // Le cas qui cassait: la liste des commandes renvoie la ligne brute.
    expect(amountToCollectMajor({ order: commande({ total: 7500 }), currency: XOF })).toBe(7500);
  });

  it('lit `total_price` quand l appelant l a mappe', () => {
    expect(amountToCollectMajor({ order: commande({ total_price: 7500 }), currency: XOF })).toBe(
      7500,
    );
  });

  it('privilegie `total_price` quand les deux sont presents', () => {
    expect(
      amountToCollectMajor({ order: commande({ total_price: 7500, total: 7500 }), currency: XOF }),
    ).toBe(7500);
  });

  it('privilegie le total du panier en mode caisse', () => {
    // Mode PANIER: le total est deja en unites majeures, il fait foi.
    expect(
      amountToCollectMajor({ totalProp: 1200, order: commande({ total: 9999 }), currency: XOF }),
    ).toBe(1200);
  });

  it('accepte un total de panier a zero sans retomber sur la commande', () => {
    expect(
      amountToCollectMajor({ totalProp: 0, order: commande({ total: 9999 }), currency: XOF }),
    ).toBe(0);
  });

  it('rend zero sans commande ni total', () => {
    expect(amountToCollectMajor({ currency: XOF })).toBe(0);
  });

  it('rend zero quand la commande n a aucun montant', () => {
    expect(amountToCollectMajor({ order: commande({}), currency: XOF })).toBe(0);
  });

  it('convertit les unites mineures en unites majeures pour une devise a decimales', () => {
    // EUR a deux decimales: 7500 centimes valent 75 euros. XOF n'en a pas.
    expect(amountToCollectMajor({ order: commande({ total: 7500 }), currency: 'EUR' })).toBe(75);
  });
});
