// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { PermissionMap, Poste } from '@/types/permission.types';
import type { Order } from '@/types/admin.types';
import { ItemsHeader } from '../items/ItemsHeader';
import OrdersBulkActionBar from '../orders/OrdersBulkActionBar';
import { OrderActionsPanel } from '../order-details/OrderActionsPanel';
import { POSCartFooter } from '@/components/features/pos/POSCartFooter';
import type { PricingBreakdown } from '@/types/admin.types';

// Fait 1 et X5: l'ecran montrait des gestes que le serveur refusait ensuite
// (le caissier remplissait tout le formulaire "Ajouter un plat" avant le refus;
// un caissier voyait la corbeille des commandes, reservee a l'autorite d'argent).
// Fait 2 et X1: le serveur et le chef n'encaissent pas, ils marquent la
// commande servie. Les niveaux viennent de la vraie resolution des droits.

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/useSegmentTerms', () => ({
  useSegmentTerms: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../OrderPaymentPanel', () => ({ default: () => null }));
// Le bouton d'annulation de la fiche appelle une action serveur: simulee ici.
vi.mock('@/app/actions/orders', () => ({ actionUpdateOrderStatus: vi.fn() }));

function withRole(poste: Poste, ui: React.ReactElement, overrides: PermissionMap = {}) {
  const levels = getEffectiveLevels({ postes: [poste], permission_overrides: overrides });
  return render(
    <PermissionsProvider postes={[poste]} levels={levels}>
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
  it.each(['cashier', 'waiter'] as Poste[])('%s ne voit pas le bouton', (poste) => {
    withRole(poste, header);
    expect(screen.queryByText('addItem')).toBeNull();
  });
  it.each(['manager', 'chef'] as Poste[])('%s le voit (menu.edit)', (poste) => {
    withRole(poste, header);
    expect(screen.getByText('addItem')).toBeInTheDocument();
  });
});

describe('Suppression groupee des commandes (autorite d argent)', () => {
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
  it('le gerant (les quatre droits d argent) voit la corbeille', () => {
    withRole('manager', bar);
    expect(screen.getByLabelText('delete')).toBeInTheDocument();
    expect(screen.getByLabelText('aria.next')).toBeInTheDocument();
  });
  it('le caissier ne voit pas la corbeille mais peut faire avancer', () => {
    withRole('cashier', bar);
    expect(screen.queryByLabelText('delete')).toBeNull();
    expect(screen.getByLabelText('aria.next')).toBeInTheDocument();
  });
  it('un caissier avec UN SEUL des quatre droits ne la voit pas', () => {
    withRole('cashier', bar, { 'orders.refund': true });
    expect(screen.queryByLabelText('delete')).toBeNull();
  });
  it('un caissier avec les quatre droits la voit', () => {
    withRole('cashier', bar, {
      'orders.pay': true,
      'orders.refund': true,
      'orders.cancel': true,
      'orders.discount': true,
    });
    expect(screen.getByLabelText('delete')).toBeInTheDocument();
  });
  it('le gerant a qui le proprietaire retire orders.pay ne la voit plus', () => {
    withRole('manager', bar, { 'orders.pay': false });
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
  // Annuler depuis la fiche exige le meme droit que l'action (orders.pay).
  it('sans orders.pay: pas de bouton "annuler la commande"', () => {
    withRole('waiter', panel(false));
    expect(screen.queryByText('cancelOrderButton')).toBeNull();
  });
  it('avec orders.pay: bouton "annuler la commande" sur la fiche', () => {
    withRole('cashier', panel(true));
    expect(screen.getByText('cancelOrderButton')).toBeInTheDocument();
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
