// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { CellContext } from '@tanstack/react-table';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';
import { useOrdersColumns } from '../use-orders-columns';
import { useOrderStatusConfig } from '../use-order-status-config';
import OrderMobileCard from '../OrderMobileCard';
import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { Poste } from '@/types/permission.types';

// The provider deliberately gets NO timeZone: in production next-intl falls back
// to the server zone (UTC on Vercel). The restaurant zone must win over it.
// Le statut suivant depend des droits: le poste rendu est regle par test.
let poste: Poste = 'manager';
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="fr-FR" messages={messages}>
    <PermissionsProvider postes={[poste]} levels={getEffectiveLevels({ postes: [poste] })}>
      {children}
    </PermissionsProvider>
  </NextIntlClientProvider>
);

const order = {
  id: 'c137c885-0000-0000-0000-000000000000',
  tenant_id: 't',
  order_number: 'CMD-20261109-002',
  table_number: '4',
  status: 'preparing',
  total_price: 5000,
  created_at: '2026-11-09T14:05:00Z',
} as Order;

function renderColumns(timeZone: string, o: Order = order) {
  const { result } = renderHook(
    () =>
      useOrdersColumns({
        selectedIds: new Set(),
        setSelectedIds: () => {},
        filteredOrders: [order],
        setSelectedOrder: () => {},
        getStatusConfig: useOrderStatusConfig(),
        formatNumber: String,
        handleStatusChange: () => {},
        timeZone,
      }),
    { wrapper },
  );
  const cellOf = (key: string) => {
    const cell = result.current.find((c) => 'accessorKey' in c && c.accessorKey === key)?.cell;
    if (typeof cell !== 'function') throw new Error(`no cell for ${key}`);
    return cell({ row: { original: o } } as CellContext<Order, unknown>);
  };
  render(
    <div>
      {cellOf('order_number')}
      {cellOf('created_at')}
      {cellOf('status')}
    </div>,
    { wrapper },
  );
}

describe('useOrdersColumns', () => {
  beforeEach(() => {
    poste = 'manager';
  });

  // Audit de conformite M2: le bouton "statut suivant" n'est propose qu'a qui
  // peut le poser. Une commande en preparation avance vers "pret", geste de
  // cuisine: ni le serveur ni le caissier ne le voient.
  // Carte de la liste (meme source que la colonne: `useOrderStatusConfig`).
  const renderCard = (o: Order) => {
    const Card = () => (
      <OrderMobileCard
        order={o}
        getStatusConfig={useOrderStatusConfig()}
        formatNumber={String}
        handleStatusChange={() => {}}
        timeZone="Africa/Abidjan"
      />
    );
    render(<Card />, { wrapper });
  };
  it.each(['waiter', 'cashier'] as Poste[])(
    '%s: pas de bouton vers "pret" sur une commande en preparation',
    (p) => {
      poste = p;
      renderCard(order);
      expect(screen.queryByText(messages.orders.actionReady)).not.toBeInTheDocument();
    },
  );
  it('temoin, cuisinier: le bouton vers "pret" est la', () => {
    poste = 'cook';
    renderCard(order);
    expect(screen.getByText(messages.orders.actionReady)).toBeInTheDocument();
  });
  it('serveur: une commande prete garde son bouton "servir"', () => {
    poste = 'waiter';
    renderCard({ ...order, status: 'ready' });
    expect(screen.getByText(messages.orders.actionDeliver)).toBeInTheDocument();
  });

  it('shows the order number, the time and the status of each order', () => {
    renderColumns('Africa/Abidjan');
    expect(screen.getByText('CMD-20261109-002')).toBeInTheDocument();
    expect(screen.getByText('14:05')).toBeInTheDocument();
    expect(screen.getByText(messages.orders.statusPreparingCard)).toBeInTheDocument();
  });

  it('flags a delivered but unpaid order as to collect, in the list', () => {
    renderColumns('Africa/Abidjan', { ...order, status: 'delivered', payment_status: 'pending' });
    expect(screen.getByText(messages.admin.payPending)).toBeInTheDocument();
  });

  it('does not flag a delivered and paid order', () => {
    renderColumns('Africa/Abidjan', { ...order, status: 'delivered', payment_status: 'paid' });
    expect(screen.queryByText(messages.admin.payPending)).not.toBeInTheDocument();
  });

  it('shows the time in the restaurant zone, not the server zone (UTC+1, N Djamena)', () => {
    renderColumns('Africa/Ndjamena');
    expect(screen.getByText('15:05')).toBeInTheDocument();
  });

  it('the mobile card shows the same restaurant time as the desktop column', () => {
    const MobileCard = () => (
      <OrderMobileCard
        order={order}
        getStatusConfig={useOrderStatusConfig()}
        formatNumber={String}
        handleStatusChange={() => {}}
        timeZone="Africa/Ndjamena"
      />
    );
    render(<MobileCard />, { wrapper });
    expect(screen.getByText('15:05')).toBeInTheDocument();
  });
});
