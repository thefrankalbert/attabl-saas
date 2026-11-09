// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { DEFAULT_PERMISSIONS, type PermissionCode } from '@/types/permission.types';
import type { AdminRole } from '@/types/admin.types';
import POSClient from '../POSClient';

// Decision du proprietaire (2026-11-09): le serveur prend les commandes a la
// caisse sans toucher a l'argent. POSClient decide ce que le panier montre:
// sans `orders.pay`, ni "Valider le paiement" ni coupon (une remise).

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@/hooks/useSegmentTerms', () => ({
  useSegmentTerms: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
vi.mock('@/hooks/useDevice', () => ({ useDevice: () => ({ isMobile: false }) }));
vi.mock('@/hooks/useContextualShortcuts', () => ({ useContextualShortcuts: () => {} }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/services/order.service', () => ({ createOrderService: vi.fn() }));
vi.mock('@/hooks/usePosUnpaidOrders', () => ({
  usePosUnpaidOrders: () => ({ unpaidOrders: [], loading: false, refresh: vi.fn() }),
}));
vi.mock('@/hooks/usePOSData', () => ({
  usePOSData: () => ({
    loading: false,
    cart: [],
    menuItems: [],
    addToCart: vi.fn(),
    allTables: [],
    occupiedTableNumbers: new Set<string>(),
    enableCoupons: true,
  }),
}));
vi.mock('../RoleGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/features/pos/POSProductBrowser', () => ({ default: () => null }));
vi.mock('@/components/features/pos/POSUnpaidPanel', () => ({ default: () => null }));
vi.mock('@/components/admin/PaymentModal', () => ({ default: () => null }));
vi.mock('@/components/admin/service/ReassignTableDialog', () => ({
  ReassignTableDialog: () => null,
}));
vi.mock('@/components/features/pos/POSCart', () => ({
  default: (props: { enableCoupons: boolean; onCheckout?: () => void }) => (
    <div
      data-testid="cart"
      data-coupons={String(props.enableCoupons)}
      data-checkout={String(Boolean(props.onCheckout))}
    />
  ),
}));

function renderAs(role: AdminRole) {
  const permissions = DEFAULT_PERMISSIONS[role] as Record<PermissionCode, boolean>;
  render(
    <PermissionsProvider role={role} permissions={permissions}>
      <POSClient tenantId="t1" />
    </PermissionsProvider>,
  );
  return screen.getByTestId('cart');
}

describe('Caisse: argent et remises reserves a orders.pay', () => {
  it('le serveur ne voit ni encaissement ni coupon', () => {
    const cart = renderAs('waiter');
    expect(cart).toHaveAttribute('data-checkout', 'false');
    expect(cart).toHaveAttribute('data-coupons', 'false');
  });

  it('le caissier voit encaissement et coupon', () => {
    const cart = renderAs('cashier');
    expect(cart).toHaveAttribute('data-checkout', 'true');
    expect(cart).toHaveAttribute('data-coupons', 'true');
  });
});
