// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { saveScannedTable } from '@/hooks/useScannedTable';
import CartPage from '../page';

// The cart is the only place that writes orders.table_number: it reads the
// scanned table at order time. It MUST read it through the same helper every
// QR entry writes with, or a key drift silently sends the order without table.

const submitOrder = vi.fn();

vi.mock('@/lib/offline/submit-order', () => ({
  submitOrder: (...args: unknown[]) => submitOrder(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.num ? `${key}:${values.num}` : key,
  useLocale: () => 'fr-FR',
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({
    items: [{ id: 'item-1', name: 'Poulet', price: 2500, quantity: 1 }],
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    addToCart: vi.fn(),
    clearCart: vi.fn(),
    notes: '',
    setNotes: vi.fn(),
    currentRestaurantId: 'tenant-1',
    subtotal: 2500,
    taxAmount: 0,
    serviceChargeAmount: 0,
    discountAmount: 0,
    grandTotal: 2500,
    enableTax: false,
    enableServiceCharge: false,
    taxRate: 0,
    serviceChargeRate: 0,
    currencyCode: 'XOF',
    appliedCoupon: null,
    applyCoupon: vi.fn(),
    removeCoupon: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ slug: 'resto', tenant: { name: 'Resto' } }),
}));
vi.mock('@/contexts/CurrencyContext', () => ({
  useDisplayCurrency: () => ({
    formatDisplayPrice: (n: number) => String(n),
    resolveAndFormatPrice: (n: number) => String(n),
    displayCurrency: 'XOF',
  }),
}));
vi.mock('@/hooks/useCartSuggestions', () => ({
  useCartSuggestions: () => ({ upsellItems: [], isLoadingUpsell: false }),
}));
vi.mock('@/components/tenant/cart/CartItemsList', () => ({
  CartItemsList: () => null,
  getCartItemKey: (item: { id: string }) => item.id,
}));
vi.mock('@/components/tenant/cart/UpsellSection', () => ({ UpsellSection: () => null }));
vi.mock('@/components/tenant/cart/PromoSection', () => ({ PromoSection: () => null }));
vi.mock('@/components/tenant/cart/TipSection', () => ({ TipSection: () => null }));
vi.mock('@/components/tenant/cart/OrderSummary', () => ({ OrderSummary: () => null }));

describe('cart - table attached to the order', () => {
  beforeEach(() => {
    localStorage.clear();
    submitOrder.mockReset();
    submitOrder.mockResolvedValue({ status: 'sent', data: { orderId: 'order-1' } });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ valid: true }), { status: 200 })),
    );
  });

  it('sends the table saved by a QR scan with the order and shows it', async () => {
    saveScannedTable('resto', 'TER-1');
    render(<CartPage />);

    expect(screen.getByText(/tableLabel:TER-1/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('confirmOrder'));
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    const [{ body }] = submitOrder.mock.calls[0] as [{ body: { tableNumber?: string } }];
    expect(body.tableNumber).toBe('TER-1');
  });

  it('no scanned table: the order goes out without one', async () => {
    render(<CartPage />);
    fireEvent.click(screen.getByText('confirmOrder'));
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(1));
    const [{ body }] = submitOrder.mock.calls[0] as [{ body: { tableNumber?: string } }];
    expect(body.tableNumber).toBeUndefined();
  });
});
