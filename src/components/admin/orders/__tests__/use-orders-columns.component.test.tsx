// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { CellContext } from '@tanstack/react-table';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';
import { useOrdersColumns } from '../use-orders-columns';
import { useOrderStatusConfig } from '../use-order-status-config';
import OrderMobileCard from '../OrderMobileCard';

// The provider deliberately gets NO timeZone: in production next-intl falls back
// to the server zone (UTC on Vercel). The restaurant zone must win over it.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="fr-FR" messages={messages}>
    {children}
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
