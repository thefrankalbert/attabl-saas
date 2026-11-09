// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { TenantProvider } from '@/contexts/TenantContext';
import OrderDetailPage from '../[orderId]/page';

// Fin d'essai sans abonnement (decision produit du 2026-11-09): la page d'une
// commande passee reste lisible, mais son bouton "recommander" remplirait un
// panier que le serveur refusera. Il disparait pendant la pause.

vi.mock('next/navigation', () => ({
  useParams: () => ({ orderId: 'o1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'fr-FR',
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/contexts/CartContext', () => ({
  useCart: () => ({ addToCart: vi.fn(), items: [] }),
}));
vi.mock('@/contexts/CurrencyContext', () => ({
  useDisplayCurrency: () => ({
    formatDisplayPrice: (n: number) => String(n),
    resolveAndFormatPrice: (n: number) => String(n),
  }),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: async () => ({
      data: [
        {
          id: 'o1',
          order_number: 'CMD-20261108-001',
          table_number: '4',
          status: 'delivered',
          total: 3000,
          subtotal: 3000,
          tip_amount: 0,
          created_at: '2026-11-08T12:00:00Z',
          order_items: [
            {
              item_name: 'Brochettes',
              quantity: 1,
              price_at_order: 3000,
              menu_item_id: 'item-2',
              image_url: null,
            },
          ],
        },
      ],
      error: null,
    }),
  }),
}));

function renderPage(paused: boolean) {
  render(
    <TenantProvider slug="resto" tenantId="t1" tenant={null} orderingPaused={paused}>
      <OrderDetailPage />
    </TenantProvider>,
  );
}

describe('page commande, bouton recommander', () => {
  it('commandes ouvertes (temoin): le bouton est la', async () => {
    renderPage(false);
    expect(await screen.findByText('reorderShort')).toBeInTheDocument();
  });

  it('commandes en pause: la commande s affiche, sans bouton', async () => {
    renderPage(true);
    expect(await screen.findByText('Brochettes')).toBeInTheDocument();
    expect(screen.queryByText('reorderShort')).toBeNull();
  });
});
