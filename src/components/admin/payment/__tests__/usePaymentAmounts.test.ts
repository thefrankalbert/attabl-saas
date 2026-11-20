// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePaymentAmounts } from '@/components/admin/payment/usePaymentAmounts';
import { recordedTipMajor } from '@/components/admin/payment/order-amount';
import type { Order } from '@/types/admin.types';

/**
 * Constat A (audit pourboires 2026-11-20). Avec 5 000 de commande et 500 de
 * pourboire laisse sur la vitrine, la caisse reclamait et controlait 5 000,
 * alors que le registre `payments` inscrivait 5 500. Le caissier rendait donc
 * la monnaie sur 5 000 et la caisse finissait la journee avec 500 de moins
 * que le chiffre affiche.
 */
describe('montant reclame par la caisse avec un pourboire deja laisse', () => {
  const order = { id: 'o1', tip_amount: 500 } as Pick<Order, 'id' | 'tip_amount'>;

  it('lit le pourboire enregistre sur la commande, en unites majeures', () => {
    expect(recordedTipMajor(order, 'XOF')).toBe(500);
    expect(recordedTipMajor({ id: 'o1', tip_amount: 250 } as Order, 'EUR')).toBe(2.5);
    // Mode panier: la commande n'existe pas encore.
    expect(recordedTipMajor(undefined, 'XOF')).toBe(0);
  });

  it('reclame commande + pourboire du client, et refuse un paiement especes trop court', () => {
    const { result } = renderHook(() => usePaymentAmounts(5000, 'XOF', 500));
    expect(result.current.totalWithTip).toBe(5500);
    expect(result.current.tipAmount).toBe(500);
    // Rien d'ajoute a la caisse: rien a envoyer au serveur.
    expect(result.current.extraTip).toBe(0);

    act(() => result.current.handleKeypadPress('5000'));
    expect(result.current.cashIsValid).toBe(false);
    expect(result.current.amountRemaining).toBe(500);
  });

  it('ajoute le pourboire de la caisse a celui du client, sans le compter deux fois', () => {
    const { result } = renderHook(() => usePaymentAmounts(5000, 'XOF', 500));
    act(() => result.current.tipProps.onFixed(1000));
    expect(result.current.extraTip).toBe(1000);
    expect(result.current.tipAmount).toBe(1500);
    expect(result.current.totalWithTip).toBe(6500);
  });
});
