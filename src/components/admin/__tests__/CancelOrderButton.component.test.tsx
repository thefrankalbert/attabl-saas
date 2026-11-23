// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';

// Troisieme contre-audit du lot A: une commande ancienne (d'ardoise, remboursee)
// doit pouvoir etre annulee depuis sa fiche, avec l'action serveur existante.

const { mockUpdateStatus, mockToast } = vi.hoisted(() => ({
  mockUpdateStatus: vi.fn(),
  mockToast: vi.fn(),
}));
vi.mock('@/app/actions/orders', () => ({ actionUpdateOrderStatus: mockUpdateStatus }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { CancelOrderButton } from '../order-details/CancelOrderButton';

type Overrides = Partial<Pick<Order, 'status' | 'payment_status'>>;

function renderButton(overrides: Overrides, canPay = true, onCancelled = vi.fn()) {
  const order = {
    id: 'o1',
    tenant_id: 't1',
    status: 'delivered',
    payment_status: 'refunded',
    ...overrides,
  } as unknown as Order;
  render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <CancelOrderButton order={order} canPay={canPay} onCancelled={onCancelled} />
    </NextIntlClientProvider>,
  );
  return onCancelled;
}

const cancelButton = () => screen.queryByRole('button', { name: 'Annuler la commande' });

describe('CancelOrderButton', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it.each(['refunded', 'partial', 'pending'] as const)(
    'visible pour une commande servie au statut de paiement %s',
    (payment_status) => {
      renderButton({ payment_status });
      expect(cancelButton()).toBeInTheDocument();
    },
  );

  it('visible pour un statut de paiement NULL (vaut pending)', () => {
    renderButton({ payment_status: null as unknown as Order['payment_status'] });
    expect(cancelButton()).toBeInTheDocument();
  });

  // Temoins: la ou cancelOrder refuse, ou sans le droit de l'action, rien.
  it('absent pour une commande payee', () => {
    renderButton({ payment_status: 'paid' });
    expect(cancelButton()).toBeNull();
  });

  it('absent pour une commande deja annulee', () => {
    renderButton({ status: 'cancelled' });
    expect(cancelButton()).toBeNull();
  });

  it('absent sans le droit orders.pay', () => {
    renderButton({}, false);
    expect(cancelButton()).toBeNull();
  });

  it('demande confirmation, puis appelle l action existante et rafraichit', async () => {
    mockUpdateStatus.mockResolvedValue({ success: true });
    const onCancelled = renderButton({});
    fireEvent.click(cancelButton() as HTMLElement);
    // Rien n'est envoye avant la confirmation.
    expect(mockUpdateStatus).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(
      Array.from(confirm.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Annuler la commande',
      ) as HTMLElement,
    );
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith('t1', 'o1', 'cancelled'));
    await waitFor(() => expect(onCancelled).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith({ title: 'Commande annulee' });
  });

  it('erreur du serveur: message affiche, pas de rafraichissement', async () => {
    mockUpdateStatus.mockResolvedValue({ error: 'Votre role ne permet pas' });
    const onCancelled = renderButton({});
    fireEvent.click(cancelButton() as HTMLElement);
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(
      Array.from(confirm.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Annuler la commande',
      ) as HTMLElement,
    );
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Annulation impossible',
        description: 'Votre role ne permet pas',
        variant: 'destructive',
      }),
    );
    expect(onCancelled).not.toHaveBeenCalled();
  });
});
