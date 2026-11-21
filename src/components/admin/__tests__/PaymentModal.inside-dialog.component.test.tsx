// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr-FR.json';
import type { Order } from '@/types/admin.types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import PaymentModal from '../PaymentModal';

/**
 * Mesure du 2026-11-21 sur un build de production local: ouvert depuis le
 * detail d'une commande (fenetre Radix modale), l'ecran d'encaissement
 * ignorait TOUS les clics. Radix pose `pointer-events: none` sur <body>, et le
 * portail de l'ecran (enfant de <body>, hors du contenu Radix) en heritait.
 * La correction est la classe `pointer-events-auto` sur la racine de l'ecran.
 * Sans feuille de style ici, happy-dom ne l'applique pas: on verifie donc la
 * classe (absente de l'ancien code), et le clic avec la verification de
 * pointer-events coupee. La preuve dans un vrai navigateur est la mesure
 * elementFromPoint decrite ci-dessus.
 */

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
  tip_amount: 500,
  display_currency: 'XOF',
} as unknown as Order;

describe('PaymentModal ouvert depuis une fenetre Radix (detail de commande)', () => {
  afterEach(cleanup);

  it('reste cliquable: le pourboire de la caisse s ajoute au montant', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <NextIntlClientProvider locale="fr-FR" messages={messages}>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Detail</DialogTitle>
            <PaymentModal order={order} currency="XOF" onClose={() => {}} onSuccess={() => {}} />
          </DialogContent>
        </Dialog>
      </NextIntlClientProvider>,
    );
    expect(document.body.style.pointerEvents).toBe('none');
    const screenRoot = screen.getByRole('dialog', { name: /Encaissement/ });
    expect(screenRoot).toHaveClass('pointer-events-auto');
    await user.click(screen.getAllByRole('button', { name: /^1\D?000$/ })[0]);
    expect(screen.getAllByText(/6\D?500/).length).toBeGreaterThan(0);
  });
});
