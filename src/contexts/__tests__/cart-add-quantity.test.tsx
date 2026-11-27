// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from '../CartContext';

vi.mock('../TenantContext', () => ({
  useTenant: () => ({
    tenantId: 't1',
    slug: 'resto',
    tenant: { currency: 'XOF', enable_tax: false, enable_service_charge: false },
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;
const line = (over: Record<string, unknown> = {}) => ({
  id: 'plat',
  name: 'Plat',
  price: 6500,
  quantity: 1,
  ...over,
});
const setup = () => renderHook(() => useCart(), { wrapper });

describe('addToCart conserve la quantite choisie', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('plat sans option, quantite 1 (bouton rapide de la liste)', () => {
    const { result } = setup();
    act(() => result.current.addToCart(line(), 'r1', true));
    expect(result.current.items[0].quantity).toBe(1);
  });

  it('plat avec options, quantite 2 (fenetre du plat)', () => {
    const { result } = setup();
    act(() =>
      result.current.addToCart(
        line({ quantity: 2, modifiers: [{ id: 'm1', name: 'Piment', price: 0 }] }),
        'r1',
      ),
    );
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
    expect(result.current.subtotal).toBe(13000);
  });

  it('plat avec variante de prix, quantite 3', () => {
    const { result } = setup();
    act(() =>
      result.current.addToCart(
        line({
          quantity: 3,
          selectedVariant: { id: 'v1', name_fr: 'Grand', price: 6500 },
        }),
        'r1',
      ),
    );
    expect(result.current.items[0].quantity).toBe(3);
  });

  it('meme ligne ajoutee deux fois: les quantites s additionnent', () => {
    const { result } = setup();
    act(() => result.current.addToCart(line({ quantity: 2 }), 'r1'));
    act(() => result.current.addToCart(line({ quantity: 3 }), 'r1'));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(5);
  });

  it('re-commande: 3 ajouts unitaires donnent 3 (chemin deja correct, temoin)', () => {
    const { result } = setup();
    for (let i = 0; i < 3; i++) act(() => result.current.addToCart(line(), 'r1', true));
    expect(result.current.items[0].quantity).toBe(3);
  });

  it('une ligne ne depasse jamais 99', () => {
    const { result } = setup();
    act(() => result.current.addToCart(line({ quantity: 98 }), 'r1'));
    act(() => result.current.addToCart(line({ quantity: 5 }), 'r1'));
    expect(result.current.items[0].quantity).toBe(99);
  });

  it('changement de restaurant confirme: la quantite choisie est conservee', () => {
    const { result } = setup();
    act(() => result.current.addToCart(line({ id: 'autre' }), 'r1'));
    act(() => result.current.addToCart(line({ quantity: 2 }), 'r2'));
    act(() => result.current.confirmPendingAddToCart());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
  });
});
