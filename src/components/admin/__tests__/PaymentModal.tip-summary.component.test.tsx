// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';
import PaymentModal from '../PaymentModal';

// Test en direct 2026-11-15: avec un pourboire, l'ecran disait "Montant a payer
// 6 000" a cote de "Total 5 000" sans expliquer l'ecart. Le recu doit afficher
// la ligne Pourboire et le "Total avec pourboire".

vi.mock('@/lib/offline/submit-order', () => ({ submitOrder: vi.fn() }));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ canAccess: () => true }),
}));
vi.mock('@/components/admin/orders/CompOrderDialog', () => ({ default: () => null }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const order = {
  id: 'o1',
  tenant_id: 't1',
  total: 5000,
  subtotal: 5000,
  display_currency: 'XOF',
} as unknown as Order;

function renderModal() {
  return render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <PaymentModal order={order} currency="XOF" onClose={() => {}} onSuccess={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe('PaymentModal - pourboire explique dans le recu', () => {
  afterEach(cleanup);

  it('sans pourboire: pas de ligne "Total avec pourboire" (temoin negatif)', () => {
    renderModal();
    expect(screen.queryByText('Total avec pourboire')).not.toBeInTheDocument();
  });

  it('avec un pourboire de 1 000: ligne Pourboire puis Total avec pourboire', () => {
    renderModal();
    fireEvent.click(screen.getAllByRole('button', { name: /^1\D?000$/ })[0]);
    const row = screen.getByText('Total avec pourboire').parentElement;
    expect(row).toHaveTextContent(/6\D?000/);
  });
});
