// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import messages from '@/messages/fr-FR.json';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { Order } from '@/types/admin.types';

// Verification visuelle du lot A (D2): la fenetre de detail de la page
// Commandes gardait la copie de la commande prise au clic. Apres une annulation
// faite dans la fenetre, elle affichait encore le bouton d'annulation et le
// formulaire d'encaissement. Elle doit montrer l'etat reel de la commande.

const TENANT = 't1';

// "Base": l'etat serveur de la commande, modifie par l'action d'annulation.
const db = vi.hoisted(() => ({ status: 'pending' as string }));

const { mockUpdateStatus } = vi.hoisted(() => ({ mockUpdateStatus: vi.fn() }));
vi.mock('@/app/actions/orders', () => ({
  actionUpdateOrderStatus: mockUpdateStatus,
  actionGetPaymentSummary: async () => ({
    summary: {
      orderId: 'o1',
      due: 10000,
      completed: 0,
      refunded: 0,
      net: 0,
      paymentStatus: 'pending',
      tenders: [],
    },
  }),
  actionRecordTender: vi.fn(),
  actionRefundOrder: vi.fn(),
}));

function order(): Order {
  return {
    id: 'o1',
    tenant_id: TENANT,
    order_number: 'CMD-1',
    table_number: 'T1',
    status: db.status,
    payment_status: 'pending',
    total: 10000,
    items: [],
    created_at: '2026-11-23T10:00:00Z',
  } as unknown as Order;
}

// La liste vient d'une vraie requete TanStack (cle ['orders', tenant, ...]):
// l'invalider la relit, comme en production.
vi.mock('@/hooks/queries', () => ({
  useOrders: (tenantId: string) =>
    useQuery({ queryKey: ['orders', tenantId], queryFn: async () => [order()] }),
}));
vi.mock('@/hooks/mutations', () => ({ useUpdateOrderStatus: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useRealtimeSubscription', () => ({ useRealtimeSubscription: () => {} }));
vi.mock('@/hooks/useContextualShortcuts', () => ({ useContextualShortcuts: () => {} }));
vi.mock('@/hooks/useSessionState', async () => {
  const { useState } = await import('react');
  return { useSessionState: <T,>(_k: string, v: T) => useState<T>(v) };
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/sites/r/admin/orders',
}));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/SoundContext', () => ({ useSound: () => ({ play: vi.fn() }) }));
vi.mock('@/hooks/queries/useTenantSettings', () => ({
  useTenantSettings: () => ({ data: { currency: 'XAF' } }),
}));
vi.mock('@/hooks/useDevice', () => ({ useDevice: () => ({ isTablet: false }) }));
vi.mock('@/hooks/useSegmentTerms', () => ({
  useSegmentTerms: () => new Proxy({}, { get: (_t, k) => String(k) }),
}));
// Mise en page de la liste: une ligne cliquable par commande suffit ici.
vi.mock('@/components/admin/ResponsiveDataTable', () => ({
  ResponsiveDataTable: ({
    data,
    onRowClick,
  }: {
    data: Order[];
    onRowClick: (o: Order) => void;
  }) => (
    <div>
      {data.map((o) => (
        <span key={o.id} data-testid="row" data-status={o.status} onClick={() => onRowClick(o)}>
          {o.order_number}
        </span>
      ))}
    </div>
  ),
}));
vi.mock('@/components/admin/AdminModal', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}));
vi.mock('@/components/admin/orders/OrdersToolbar', () => ({ default: () => null }));
vi.mock('@/components/admin/orders/OrdersBulkActionBar', () => ({ default: () => null }));
vi.mock('@/components/admin/orders/OrdersBulkDeleteDialog', () => ({ default: () => null }));
vi.mock('@/components/admin/orders/OrderMobileCard', () => ({ default: () => null }));
vi.mock('@/components/admin/ListPagination', () => ({ ListPagination: () => null }));
vi.mock('@/components/admin/orders/use-orders-columns', () => ({ useOrdersColumns: () => [] }));
vi.mock('@/components/admin/orders/use-order-status-config', () => ({
  useOrderStatusConfig: () => () => ({}),
}));
vi.mock('@/components/admin/orders/use-bulk-delete-orders', () => ({
  useBulkDeleteOrders: () => ({ handleBulkDelete: vi.fn(), isDeleting: false }),
}));
vi.mock('@/components/admin/PaymentModal', () => ({ default: () => null }));
vi.mock('@/components/admin/orders/AttachToHouseAccount', () => ({ default: () => null }));
vi.mock('@/components/admin/orders/CompOrderDialog', () => ({ default: () => null }));
vi.mock('@/components/admin/orders/OrderNotesSection', () => ({ default: () => null }));
vi.mock('@/components/admin/payment/PaymentMethodPicker', () => ({
  PaymentMethodPicker: () => null,
  effectivePaymentMethod: (c: string | null, choices: string[]) => c ?? choices[0],
  usePaymentMethodChoices: () => ['cash'],
}));

import OrdersClient from '../OrdersClient';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr-FR" messages={messages} timeZone="UTC">
        <PermissionsProvider postes={['owner']} levels={getEffectiveLevels({ postes: ['owner'] })}>
          <OrdersClient tenantId={TENANT} initialOrders={[order()]} timeZone="UTC" />
        </PermissionsProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('Page Commandes: la fenetre de detail suit l etat reel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.status = 'pending';
    mockUpdateStatus.mockImplementation(async () => {
      db.status = 'cancelled';
      return { success: true };
    });
  });
  afterEach(cleanup);

  it('apres une annulation depuis la fenetre: plus de bouton ni de formulaire d encaissement', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('row'));
    const modal = await screen.findByTestId('modal');
    // Avant: le bouton d'annulation et le champ de montant sont la.
    const cancel = await within(modal).findByRole('button', { name: 'Annuler la commande' });
    expect(await within(modal).findByRole('spinbutton')).toBeInTheDocument();
    // Temoin: tant que la commande est due, "Reste a payer" est affiche.
    expect(await within(modal).findByText(/Reste à payer/)).toBeInTheDocument();

    fireEvent.click(cancel);
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(
      Array.from(confirm.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Annuler la commande',
      ) as HTMLElement,
    );
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith(TENANT, 'o1', 'cancelled'));

    // La liste est relue, et la fenetre avec elle.
    await waitFor(() =>
      expect(screen.getByTestId('row')).toHaveAttribute('data-status', 'cancelled'),
    );
    await waitFor(() =>
      expect(within(modal).queryByRole('button', { name: 'Annuler la commande' })).toBeNull(),
    );
    expect(within(modal).queryByRole('spinbutton')).toBeNull();
    // Une commande annulee ne doit plus rien: la ligne "Reste a payer" disparait.
    expect(within(modal).queryByText(/Reste à payer/)).toBeNull();
  });
});
