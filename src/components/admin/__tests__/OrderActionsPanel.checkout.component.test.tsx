// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';
import { OrderActionsPanel } from '../order-details/OrderActionsPanel';

vi.mock('../OrderPaymentPanel', () => ({ default: () => null }));

type Overrides = Partial<Pick<Order, 'status' | 'payment_status'>>;

function renderPanel(overrides: Overrides, isComp = false) {
  const order = { id: 'o1', tenant_id: 't1', status: 'ready', ...overrides } as unknown as Order;
  render(
    <NextIntlClientProvider locale="fr-FR" messages={messages}>
      <OrderActionsPanel
        order={order}
        loading={false}
        isComp={isComp}
        canPay
        canComp={false}
        currency="XAF"
        onUpdate={() => {}}
        onStatusUpdate={() => {}}
        onShowPayment={() => {}}
        onPrintKitchen={() => {}}
        onPrintReceipt={() => {}}
        onPrintInvoice={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

const checkout = () => screen.queryByRole('button', { name: /Encaisser/ });

describe('OrderActionsPanel - bouton Encaisser', () => {
  afterEach(cleanup);

  it('reste visible pour une commande servie mais impayee', () => {
    renderPanel({ status: 'delivered', payment_status: 'pending' });
    expect(checkout()).toBeInTheDocument();
    // Les boutons de statut restent masques une fois servie.
    expect(screen.queryByRole('button', { name: /En préparation/ })).toBeNull();
  });

  // Temoins negatifs: la ou il n'y a plus rien a encaisser, pas de bouton.
  it('absent pour une commande servie et deja payee', () => {
    renderPanel({ status: 'delivered', payment_status: 'paid' });
    expect(checkout()).toBeNull();
  });

  it('absent pour une commande annulee', () => {
    renderPanel({ status: 'cancelled', payment_status: 'pending' });
    expect(checkout()).toBeNull();
  });

  it('absent pour une commande offerte', () => {
    renderPanel({ status: 'delivered', payment_status: 'comp' }, true);
    expect(checkout()).toBeNull();
  });

  it('absent pour une commande payee en partie: on solde dans le registre', () => {
    renderPanel({ status: 'ready', payment_status: 'partial' });
    expect(checkout()).toBeNull();
  });

  // Un caissier garde "Marquer servie" quand le bouton rapide n'a rien a encaisser.
  it.each(['paid', 'partial', 'refunded'] as const)(
    'offre Marquer servie au caissier pour une commande prete et %s',
    (payment_status) => {
      renderPanel({ status: 'ready', payment_status });
      expect(screen.getByRole('button', { name: /Servie/i })).toBeInTheDocument();
    },
  );

  it('ne double pas Marquer servie quand Encaisser est offert (impayee)', () => {
    renderPanel({ status: 'ready', payment_status: 'pending' });
    expect(screen.queryByRole('button', { name: /Servie/i })).toBeNull();
  });

  it('present pour une commande prete et impayee', () => {
    renderPanel({ status: 'ready', payment_status: 'pending' });
    expect(checkout()).toBeInTheDocument();
    // Temoin positif du selecteur de statut utilise plus haut.
    expect(screen.getByRole('button', { name: /En préparation/ })).toBeInTheDocument();
  });
});
