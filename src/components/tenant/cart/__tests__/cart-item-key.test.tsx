// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from '@/contexts/CartContext';
import { getCartItemKey } from '../CartItemsList';

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenantId: 't1',
    slug: 'resto',
    tenant: { currency: 'XOF', enable_tax: false, enable_service_charge: false },
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;

// Plat avec variante et option portant un identifiant: le cas ou les deux
// calculs de cle divergeaient (les boutons du panier ne faisaient rien).
const ligne = {
  id: 'plat-1',
  name: 'Burger',
  price: 5500,
  quantity: 1,
  selectedVariant: { id: 'var-grand', name_fr: 'Grand', price: 5500 },
  modifiers: [{ id: 'mod-fromage', name: 'Fromage', price: 0 }],
};

describe('cle de ligne du panier: meme calcul que CartContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('plus et moins agissent sur une ligne avec variante et option', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(ligne, 'r1', true));
    const cle = getCartItemKey(result.current.items[0]);

    act(() => result.current.updateQuantity(cle, 3));
    expect(result.current.items[0].quantity).toBe(3);

    act(() => result.current.updateQuantity(cle, 2));
    expect(result.current.items[0].quantity).toBe(2);
  });

  it('retirer supprime la ligne avec variante et option', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(ligne, 'r1', true));
    act(() => result.current.removeFromCart(getCartItemKey(result.current.items[0])));
    expect(result.current.items).toHaveLength(0);
  });

  it('temoin: une cle calculee sur les noms ne retrouve pas la ligne', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => result.current.addToCart(ligne, 'r1', true));
    act(() => result.current.updateQuantity('plat-1-var-Grand-mod-Fromage', 4));
    expect(result.current.items[0].quantity).toBe(1);
  });
});
