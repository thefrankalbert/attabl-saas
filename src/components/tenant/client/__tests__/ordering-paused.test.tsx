// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TenantProvider } from '@/contexts/TenantContext';
import { CardAddControl } from '../CardAddControl';
import { ClientFloatingCart } from '../FloatingCart';
import { ClientBottomNav } from '../BottomNav';
import { HomeHero } from '../HomeHero';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import { TerminalOrderCard } from '@/components/tenant/client-orders/TerminalOrderCard';
import type { MenuItem } from '@/types/admin.types';
import type { OrderRecord } from '@/components/tenant/client-orders/types';

// Fin d'essai sans abonnement (decision produit du 2026-11-09): la carte reste
// visible 7 jours, mais AUCUN geste du convive ne doit remplir un panier ou
// lancer une commande que le serveur refusera. Chaque point d'entree est
// verifie ici, avec son temoin "commandes ouvertes".

const addToCart = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/sites/resto/menu',
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'fr-FR',
}));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@/components/tenant/client/Photo', () => ({ Photo: () => null }));
vi.mock('@/contexts/CartContext', () => {
  const data = {
    items: [{ id: 'item-1', name: 'Poulet', price: 2500, quantity: 2, image_url: null }],
    totalItems: 2,
    subtotal: 5000,
    currencyCode: 'XOF',
  };
  const actions = { addToCart, updateQuantity: vi.fn(), removeFromCart: vi.fn() };
  return {
    useCartData: () => data,
    useCartActions: () => actions,
    useCart: () => ({ ...data, ...actions }),
  };
});
vi.mock('@/contexts/CurrencyContext', () => ({
  useDisplayCurrency: () => ({
    formatDisplayPrice: (n: number) => String(n),
    resolveAndFormatPrice: (n: number) => String(n),
  }),
}));

const item = {
  id: 'item-2',
  name: 'Brochettes',
  price: 3000,
  is_available: true,
  options: [],
  price_variants: [],
  modifiers: [],
} as unknown as MenuItem;

const order = {
  id: 'o1',
  order_number: 'CMD-001',
  status: 'delivered',
  created_at: '2026-11-08T12:00:00Z',
  total: 3000,
  tip_amount: 0,
  items: [],
} as unknown as OrderRecord;

function withTenant(paused: boolean, children: ReactNode) {
  return (
    <TenantProvider slug="resto" tenantId="t1" tenant={null} orderingPaused={paused}>
      {children}
    </TenantProvider>
  );
}

describe.each([
  [true, 'commandes en pause'],
  [false, 'commandes ouvertes (temoin)'],
])('vitrine, orderingPaused=%s (%s)', (paused) => {
  beforeEach(() => addToCart.mockReset());

  it('carte de plat: le "+" existe seulement quand on peut commander', () => {
    render(
      withTenant(
        paused,
        <CardAddControl
          item={item}
          restaurantId="t1"
          onOpen={vi.fn()}
          placement="corner"
          addLabel="ajouter"
        />,
      ),
    );
    expect(screen.queryByLabelText('ajouter') !== null).toBe(!paused);
  });

  it('panier flottant: cache pendant la pause', () => {
    render(withTenant(paused, <ClientFloatingCart slug="resto" />));
    expect(screen.queryByLabelText(/viewCart/) !== null).toBe(!paused);
  });

  it('barre du bas: pas de pastille panier pendant la pause', () => {
    render(withTenant(paused, <ClientBottomNav slug="resto" />));
    expect(screen.queryByText('2') !== null).toBe(!paused);
  });

  it('plat du jour: pas de "Commander" pendant la pause', () => {
    render(
      withTenant(
        paused,
        <HomeHero
          item={item}
          name="Brochettes"
          price={3000}
          restaurantId="t1"
          currencyCode="XOF"
          currencyUnit="FCFA"
        />,
      ),
    );
    expect(screen.queryByText('commander') !== null).toBe(!paused);
  });

  it('fiche du plat: le bouton explique la pause et n ajoute rien', () => {
    render(
      withTenant(
        paused,
        <ItemDetailSheet item={item} isOpen onClose={vi.fn()} restaurantId="t1" />,
      ),
    );
    const label = paused ? 'orderingPaused' : 'addToCart';
    const button = screen.getByText(label).closest('button');
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(paused);
    fireEvent.click(button!);
    expect(addToCart).toHaveBeenCalledTimes(paused ? 0 : 1);
  });

  it('commande passee: pas de "recommander" pendant la pause', () => {
    render(
      withTenant(
        paused,
        <TerminalOrderCard order={order} tenantSlug="resto" currency="XOF" onReorder={vi.fn()} />,
      ),
    );
    expect(screen.queryByText('reorderShort') !== null).toBe(!paused);
  });
});

describe('bandeau de la vitrine', () => {
  it('affiche la pause seulement en lecture seule', async () => {
    const { OrderingPausedNotice } = await import('../OrderingPausedNotice');
    const { rerender } = render(withTenant(true, <OrderingPausedNotice />));
    expect(screen.getByRole('status')).toHaveTextContent('orderingPausedNotice');
    rerender(withTenant(false, <OrderingPausedNotice />));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
