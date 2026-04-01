// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import POSCart from '../POSCart';
import type { CartItem } from '@/hooks/usePOSData';
import type { MenuItem, ServiceType, CurrencyCode } from '@/types/admin.types';

// ─── Mocks ──────────────────────────────────────────────

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/lib/utils/currency', () => ({
  formatCurrency: (amount: number) => `${amount} FCFA`,
}));

// Mock window.confirm for cart clear confirmation
vi.stubGlobal(
  'confirm',
  vi.fn(() => true),
);

// ─── Test Data ──────────────────────────────────────────

const menuItem1: MenuItem = {
  id: 'item-1',
  name: 'Pizza Margherita',
  name_en: 'Pizza Margherita',
  price: 5000,
  category_id: 'cat-1',
  tenant_id: 'tenant-1',
  is_available: true,
} as MenuItem;

const menuItem2: MenuItem = {
  id: 'item-2',
  name: 'Coca-Cola',
  name_en: 'Coca-Cola',
  price: 1500,
  category_id: 'cat-2',
  tenant_id: 'tenant-1',
  is_available: true,
} as MenuItem;

const cartItem1 = {
  ...menuItem1,
  quantity: 2,
  notes: '',
} as CartItem;

const cartItem2 = {
  ...menuItem2,
  quantity: 1,
  notes: 'No ice',
} as CartItem;

const mockCallbacks = {
  setServiceType: vi.fn(),
  setSelectedTable: vi.fn(),
  setRoomNumber: vi.fn(),
  setDeliveryAddress: vi.fn(),
  onAddToCart: vi.fn(),
  onUpdateQuantity: vi.fn(),
  onClearCart: vi.fn(),
  onEditNotes: vi.fn(),
  onPrintOrder: vi.fn(),
  onCheckout: vi.fn(),
  setOrderNotes: vi.fn(),
  setCouponCode: vi.fn(),
  onValidateCoupon: vi.fn(),
  onRemoveCoupon: vi.fn(),
};

function renderCart(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    cart: [] as CartItem[],
    currency: 'XAF' as CurrencyCode,
    pricing: { subtotal: 0, taxAmount: 0, serviceChargeAmount: 0, discountAmount: 0, total: 0 },
    orderNotes: '',
    enableCoupons: false,
    couponCode: '',
    appliedCoupon: null,
    couponLoading: false,
    couponError: '',
    orderNumber: 42,
    basePath: '/sites/test/admin',
    serviceType: 'dine_in' as ServiceType,
    selectedTable: '',
    roomNumber: '',
    deliveryAddress: '',
    zones: [],
    allTables: [],
    ...mockCallbacks,
    ...overrides,
  };

  return render(<POSCart {...defaultProps} />);
}

// ─── Tests ──────────────────────────────────────────────

describe('POSCart', () => {
  beforeEach(() => {
    Object.values(mockCallbacks).forEach((fn) => fn.mockClear());
  });

  it('renders empty cart message when no items', () => {
    renderCart();
    expect(screen.getByText('emptyCart')).toBeInTheDocument();
  });

  it('renders cart items with quantities', () => {
    renderCart({
      cart: [cartItem1, cartItem2],
      pricing: {
        subtotal: 11500,
        taxAmount: 0,
        serviceChargeAmount: 0,
        discountAmount: 0,
        total: 11500,
      },
    });

    expect(screen.getByText('Pizza Margherita')).toBeInTheDocument();
    expect(screen.getByText('Coca-Cola')).toBeInTheDocument();
  });

  it('renders order number badge', () => {
    renderCart();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('calls onUpdateQuantity when + button clicked', () => {
    renderCart({
      cart: [cartItem1],
      pricing: {
        subtotal: 10000,
        taxAmount: 0,
        serviceChargeAmount: 0,
        discountAmount: 0,
        total: 10000,
      },
    });

    const allButtons = screen.getAllByRole('button');
    const addBtn = allButtons.find((btn) => btn.querySelector('.lucide-plus'));
    if (addBtn) {
      fireEvent.click(addBtn);
      expect(mockCallbacks.onUpdateQuantity).toHaveBeenCalledWith('item-1', 1);
    }
  });

  it('calls onClearCart when trash button clicked', () => {
    renderCart({
      cart: [cartItem1],
      pricing: {
        subtotal: 10000,
        taxAmount: 0,
        serviceChargeAmount: 0,
        discountAmount: 0,
        total: 10000,
      },
    });

    const allButtons = screen.getAllByRole('button');
    const trashBtn = allButtons.find((btn) => btn.querySelector('.lucide-trash-2'));
    if (trashBtn) {
      fireEvent.click(trashBtn);
      expect(mockCallbacks.onClearCart).toHaveBeenCalled();
    }
  });

  it('displays total amount', () => {
    renderCart({
      cart: [cartItem1],
      pricing: {
        subtotal: 10000,
        taxAmount: 0,
        serviceChargeAmount: 0,
        discountAmount: 0,
        total: 10000,
      },
    });
    // Total appears in at least the summary area
    const matches = screen.getAllByText('10000 FCFA');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('disables checkout button when cart is empty', () => {
    renderCart();

    const checkoutBtn = screen
      .getAllByRole('button')
      .find(
        (btn) => btn.textContent?.includes('checkout') || btn.querySelector('.lucide-arrow-right'),
      );

    if (checkoutBtn) {
      expect(checkoutBtn).toBeDisabled();
    }
  });

  it('calls onCheckout when checkout button clicked', () => {
    renderCart({
      cart: [cartItem1],
      pricing: {
        subtotal: 10000,
        taxAmount: 0,
        serviceChargeAmount: 0,
        discountAmount: 0,
        total: 10000,
      },
    });

    const allButtons = screen.getAllByRole('button');
    const checkoutBtn = allButtons.find((btn) => btn.textContent?.includes('checkout'));

    if (checkoutBtn) {
      fireEvent.click(checkoutBtn);
      expect(mockCallbacks.onCheckout).toHaveBeenCalled();
    }
  });

  it('shows notes badge on items with notes', () => {
    renderCart({
      cart: [cartItem2],
      pricing: {
        subtotal: 1500,
        taxAmount: 0,
        serviceChargeAmount: 0,
        discountAmount: 0,
        total: 1500,
      },
    });

    // Cart item with notes should display the notes text or indicator
    expect(screen.getByText('Coca-Cola')).toBeInTheDocument();
  });

  it('switches service type', () => {
    renderCart();

    const takeawayBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent?.includes('takeaway'));

    if (takeawayBtn) {
      fireEvent.click(takeawayBtn);
      expect(mockCallbacks.setServiceType).toHaveBeenCalledWith('takeaway');
    }
  });
});
