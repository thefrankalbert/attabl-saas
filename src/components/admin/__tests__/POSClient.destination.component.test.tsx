// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { DEFAULT_PERMISSIONS, type PermissionCode } from '@/types/permission.types';
import POSClient from '../POSClient';

// Test en direct 2026-11-15: une livraison sans adresse n'etait refusee qu'APRES
// toute l'etape de paiement. La caisse doit la bloquer avant, avec un message
// clair, et rafraichir "A encaisser" des qu'une commande part en cuisine.

const toast = vi.fn();
const handleOrder = vi.fn();
const refreshUnpaid = vi.fn();
let pos: Record<string, unknown> = {};

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useParams: () => ({ site: 'demo' }),
}));
vi.mock('@/hooks/useSegmentTerms', () => ({
  useSegmentTerms: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
vi.mock('@/hooks/useDevice', () => ({ useDevice: () => ({ isMobile: false }) }));
vi.mock('@/hooks/useContextualShortcuts', () => ({ useContextualShortcuts: () => {} }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/services/order.service', () => ({ createOrderService: vi.fn() }));
vi.mock('@/hooks/usePosUnpaidOrders', () => ({
  usePosUnpaidOrders: () => ({ unpaidOrders: [], loading: false, refresh: refreshUnpaid }),
}));
vi.mock('@/hooks/usePOSData', () => ({ usePOSData: () => pos }));
vi.mock('../RoleGuard', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/features/pos/POSProductBrowser', () => ({ default: () => null }));
vi.mock('@/components/features/pos/POSUnpaidPanel', () => ({ default: () => null }));
vi.mock('@/components/admin/PaymentModal', () => ({
  default: () => <div data-testid="payment-modal" />,
}));
vi.mock('@/components/admin/service/ReassignTableDialog', () => ({
  ReassignTableDialog: () => null,
}));
vi.mock('@/components/features/pos/POSCart', () => ({
  default: (props: { onPrintOrder: () => void; onCheckout?: () => void }) => (
    <>
      <button onClick={props.onPrintOrder}>send</button>
      <button onClick={props.onCheckout}>pay</button>
    </>
  ),
}));

function renderPOS(overrides: Record<string, unknown>) {
  pos = {
    loading: false,
    cart: [{ id: 'm1' }],
    menuItems: [],
    addToCart: vi.fn(),
    allTables: [],
    occupiedTableNumbers: new Set<string>(),
    enableCoupons: false,
    pricing: { total: 1000 },
    serviceType: 'takeaway',
    deliveryAddress: '',
    roomNumber: '',
    handleOrder,
    ...overrides,
  };
  render(
    <PermissionsProvider
      role="cashier"
      permissions={DEFAULT_PERMISSIONS.cashier as Record<PermissionCode, boolean>}
    >
      <POSClient tenantId="t1" />
    </PermissionsProvider>,
  );
}

describe('Caisse: destination verifiee avant envoi et paiement', () => {
  beforeEach(() => {
    toast.mockReset();
    handleOrder.mockReset();
  });
  afterEach(cleanup);

  it('livraison sans adresse: ni envoi ni paiement, message clair', () => {
    renderPOS({ serviceType: 'delivery', deliveryAddress: '  ' });
    fireEvent.click(screen.getByText('send'));
    fireEvent.click(screen.getByText('pay'));
    expect(handleOrder).not.toHaveBeenCalled();
    expect(screen.queryByTestId('payment-modal')).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'deliveryAddressRequired' }),
    );
  });

  it('service en chambre sans numero: bloque', () => {
    renderPOS({ serviceType: 'room_service' });
    fireEvent.click(screen.getByText('send'));
    expect(handleOrder).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'roomNumberRequired' }));
  });

  it("livraison avec adresse: le paiement s'ouvre (temoin positif)", () => {
    renderPOS({ serviceType: 'delivery', deliveryAddress: 'Ouaga 2000' });
    fireEvent.click(screen.getByText('pay'));
    expect(screen.getByTestId('payment-modal')).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });

  it('sur place sans table (tables configurees): ni envoi ni paiement', () => {
    renderPOS({ serviceType: 'dine_in', selectedTable: '', allTables: [{ id: 'tb1' }] });
    fireEvent.click(screen.getByText('send'));
    fireEvent.click(screen.getByText('pay'));
    expect(handleOrder).not.toHaveBeenCalled();
    expect(screen.queryByTestId('payment-modal')).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'tableRequired' }));
  });

  it('sur place sans aucune table configuree: pas de blocage (temoin)', () => {
    renderPOS({ serviceType: 'dine_in', selectedTable: '', allTables: [] });
    fireEvent.click(screen.getByText('send'));
    expect(handleOrder).toHaveBeenCalledTimes(1);
  });

  it('envoi en cuisine: "A encaisser" est rafraichi une fois la commande creee', () => {
    renderPOS({ serviceType: 'takeaway' });
    fireEvent.click(screen.getByText('send'));
    expect(handleOrder).toHaveBeenCalledWith({ onCreated: refreshUnpaid });
  });
});
