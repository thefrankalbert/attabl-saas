// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import messages from '@/messages/fr-FR.json';
import type { PaymentSummary } from '@/services/payment.service';
import OrderPaymentPanel from '../OrderPaymentPanel';

const summary: PaymentSummary = {
  orderId: 'o1',
  due: 10000,
  completed: 4000,
  refunded: 0,
  net: 4000,
  paymentStatus: 'partial',
  tenders: [
    {
      id: 't1',
      amount: 4000,
      method: 'cash',
      status: 'completed',
      createdBy: null,
      createdAt: '2026-11-09T10:00:00Z',
    },
  ],
};

vi.mock('@/app/actions/orders', () => ({
  actionGetPaymentSummary: vi.fn(async () => ({ summary })),
  actionRecordTender: vi.fn(),
  actionRefundOrder: vi.fn(),
}));
vi.mock('@/components/admin/orders/CompOrderDialog', () => ({ default: () => null }));
vi.mock('@/components/admin/orders/OrderNotesSection', () => ({ default: () => null }));
vi.mock('@/components/admin/orders/AttachToHouseAccount', () => ({ default: () => null }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Acteur courant: modifiable par test (role + permissions effectives).
const actor: { role: string; perms: Record<string, boolean> } = {
  role: 'manager',
  perms: { 'orders.pay': true },
};
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    role: actor.role,
    permissions: actor.perms,
    can: (code: string) => actor.perms[code] === true,
  }),
}));

function renderPanel() {
  // onError rethrows: a message rendered without its {amount} value (or a
  // missing key) fails the test instead of silently showing the raw key.
  const onError = (err: Error) => {
    throw err;
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="fr-FR" messages={messages} onError={onError}>
        <OrderPaymentPanel tenantId="t" orderId="o1" currency="XAF" onUpdate={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('OrderPaymentPanel', () => {
  it('renders the remaining amount with its value, not the raw key', async () => {
    renderPanel();
    const line = await screen.findByText(/^Reste a payer : /);
    expect(line.textContent).toMatch(/6\D?000/);
    expect(screen.queryByText('payment.remaining')).toBeNull();
  });

  it('translates the tender method instead of showing the raw id', async () => {
    renderPanel();
    expect(await screen.findByText('Especes')).toBeInTheDocument();
    expect(screen.queryByText('cash')).toBeNull();
  });

  it('lets the amount input shrink and the button wrap in the narrow column', async () => {
    renderPanel();
    const input = await screen.findByLabelText('Montant');
    expect(input).toHaveClass('min-w-0');
    expect(input.parentElement).toHaveClass('flex-wrap');
  });

  describe('argent selon le role', () => {
    afterEach(() => {
      actor.role = 'manager';
      actor.perms = { 'orders.pay': true };
    });

    // Decision du 2026-11-09: le serveur et le chef ne touchent pas a l'argent.
    // Ils voient ce qui est paye, sans champ d'encaissement ni de remboursement.
    it('montre le detail en lecture seule au serveur', async () => {
      actor.role = 'waiter';
      actor.perms = { 'orders.pay': false };
      renderPanel();
      expect(await screen.findByText('Especes')).toBeInTheDocument();
      expect(screen.queryByLabelText('Montant')).toBeNull();
      expect(screen.queryByRole('button', { name: /Rembourser/ })).toBeNull();
    });

    // Le caissier encaisse mais ne rembourse pas: le serveur le refusait apres
    // coup, le bouton etait pourtant affiche.
    it('laisse le caissier encaisser sans lui montrer le remboursement', async () => {
      actor.role = 'cashier';
      renderPanel();
      expect(await screen.findByLabelText('Montant')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Rembourser/ })).toBeNull();
    });

    it('montre le remboursement au gerant', async () => {
      renderPanel();
      expect(await screen.findByRole('button', { name: /Rembourser/ })).toBeInTheDocument();
    });
  });
});
