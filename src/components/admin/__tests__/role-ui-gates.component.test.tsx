// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { DEFAULT_PERMISSIONS, type PermissionCode } from '@/types/permission.types';
import type { AdminRole, Order } from '@/types/admin.types';
import { ItemsHeader } from '../items/ItemsHeader';
import OrdersBulkActionBar from '../orders/OrdersBulkActionBar';
import { OrderActionsPanel } from '../order-details/OrderActionsPanel';
import { POSCartFooter } from '@/components/features/pos/POSCartFooter';
import type { PricingBreakdown } from '@/types/admin.types';

// Fait 1 et X5: l'ecran montrait des gestes que le serveur refusait ensuite
// (le chef remplissait tout le formulaire "Ajouter un plat" avant le refus; un
// gerant voyait la corbeille des commandes, reservee a owner/admin). Fait 2 et
// X1: le serveur et le chef n'encaissent pas, ils marquent la commande servie.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/useSegmentTerms', () => ({
  useSegmentTerms: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../OrderPaymentPanel', () => ({ default: () => null }));

function withRole(role: AdminRole, ui: React.ReactElement) {
  const permissions = DEFAULT_PERMISSIONS[role] as Record<PermissionCode, boolean>;
  return render(
    <PermissionsProvider role={role} permissions={permissions}>
      {ui}
    </PermissionsProvider>,
  );
}

const noop = () => {};

describe('Ajouter un plat (menu.edit)', () => {
  const header = (
    <ItemsHeader
      categories={[]}
      categoryFilterValue="all"
      availableFilterValue="all"
      onCategoryChange={noop}
      onAvailableChange={noop}
      onAddItem={noop}
    />
  );
  it.each(['chef', 'cashier', 'waiter'] as AdminRole[])('%s ne voit pas le bouton', (role) => {
    withRole(role, header);
    expect(screen.queryByText('addItem')).toBeNull();
  });
  it('le gerant le voit', () => {
    withRole('manager', header);
    expect(screen.getByText('addItem')).toBeInTheDocument();
  });
});

describe('Suppression groupee des commandes (owner/admin)', () => {
  const bar = (
    <OrdersBulkActionBar
      selectedIds={new Set(['o1'])}
      orders={[]}
      getStatusConfig={() => ({ nextStatus: null }) as never}
      handleStatusChange={noop}
      setSelectedIds={noop}
      setShowDeleteConfirm={noop}
    />
  );
  it('le gerant ne voit pas la corbeille', () => {
    withRole('manager', bar);
    expect(screen.queryByLabelText('delete')).toBeNull();
    expect(screen.getByLabelText('Next')).toBeInTheDocument();
  });
  it('l admin la voit', () => {
    withRole('admin', bar);
    expect(screen.getByLabelText('delete')).toBeInTheDocument();
  });
  it('l admin a qui le proprietaire retire orders.pay ne la voit plus', () => {
    render(
      <PermissionsProvider
        role="admin"
        permissions={{ ...DEFAULT_PERMISSIONS.admin, 'orders.pay': false }}
      >
        {bar}
      </PermissionsProvider>,
    );
    expect(screen.queryByLabelText('delete')).toBeNull();
  });
});

describe('Detail de commande: encaisser ou marquer servie', () => {
  const order = { id: 'o1', tenant_id: 't1', status: 'ready' } as Order;
  const panel = (canPay: boolean) => (
    <OrderActionsPanel
      order={order}
      loading={false}
      isComp={false}
      canPay={canPay}
      canComp={false}
      currency="XAF"
      onUpdate={noop}
      onStatusUpdate={noop}
      onShowPayment={noop}
      onPrintKitchen={noop}
      onPrintReceipt={noop}
      onPrintInvoice={noop}
    />
  );
  it('sans orders.pay: "marquer servie", pas "encaisser"', () => {
    withRole('waiter', panel(false));
    expect(screen.getByText('statusButtonServed')).toBeInTheDocument();
    expect(screen.queryByText('statusButtonCheckout')).toBeNull();
  });
  it('avec orders.pay: "encaisser"', () => {
    withRole('cashier', panel(true));
    expect(screen.getByText('statusButtonCheckout')).toBeInTheDocument();
    expect(screen.queryByText('statusButtonServed')).toBeNull();
  });
});

// X1: a la caisse, le serveur envoie la commande en cuisine; seul qui a
// orders.pay voit "Valider le paiement" (POSClient passe onCheckout ou non).
describe('Caisse: valider le paiement', () => {
  const footer = (onCheckout?: () => void) => (
    <POSCartFooter
      cart={[{ id: 'm1', name: 'Plat', price: 1000, quantity: 1 }] as never}
      currency="XAF"
      pricing={
        {
          subtotal: 1000,
          taxAmount: 0,
          serviceChargeAmount: 0,
          discountAmount: 0,
          total: 1000,
        } as PricingBreakdown
      }
      totalItems={1}
      orderNotes=""
      setOrderNotes={noop}
      showOrderNotes={false}
      setShowOrderNotes={noop}
      enableCoupons={false}
      couponCode=""
      setCouponCode={noop}
      appliedCoupon={null}
      couponLoading={false}
      couponError=""
      onValidateCoupon={noop}
      onRemoveCoupon={noop}
      onPrintOrder={noop}
      onCheckout={onCheckout}
    />
  );
  it('sans encaissement: seulement envoyer en cuisine', () => {
    withRole('waiter', footer(undefined));
    expect(screen.getByTestId('pos-send-order')).toBeInTheDocument();
    expect(screen.queryByText('validatePayment')).toBeNull();
  });
  it('avec encaissement: valider le paiement', () => {
    withRole('cashier', footer(noop));
    expect(screen.getByText('validatePayment')).toBeInTheDocument();
  });
});
