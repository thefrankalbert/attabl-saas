// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { AdminContentWrapper } from '../AdminContentWrapper';
import { LockedSubscriptionRedirect } from '../LockedSubscriptionRedirect';

// --- Mocks ----------------------------------------------

let mockPathname = '/sites/demo/admin';
const mockReplace = vi.fn();
const mockSubscription = { isFrozen: false };

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => mockSubscription,
}));

// --- Tests ----------------------------------------------

/**
 * L'accueil (/admin) est la page d'arrivee apres connexion: un essai qui se
 * termine doit y etre annonce. Avant le correctif, le wrapper ecartait les
 * bandeaux sur l'accueil.
 */
describe('AdminContentWrapper - bandeaux d abonnement', () => {
  const chrome = <div data-testid="chrome">bandeau</div>;

  it('affiche les bandeaux sur l accueil', () => {
    mockPathname = '/sites/demo/admin';
    render(<AdminContentWrapper chrome={chrome}>page</AdminContentWrapper>);
    expect(screen.getByTestId('chrome')).toBeInTheDocument();
  });

  it('affiche les bandeaux sur une page standard', () => {
    mockPathname = '/sites/demo/admin/orders';
    render(<AdminContentWrapper chrome={chrome}>page</AdminContentWrapper>);
    expect(screen.getByTestId('chrome')).toBeInTheDocument();
  });

  it('ne les affiche pas en caisse ni en cuisine (ecrans plein ecran du personnel)', () => {
    mockPathname = '/sites/demo/admin/pos';
    const { unmount } = render(<AdminContentWrapper chrome={chrome}>page</AdminContentWrapper>);
    expect(screen.queryByTestId('chrome')).not.toBeInTheDocument();
    unmount();
    mockPathname = '/sites/demo/admin/kitchen';
    render(<AdminContentWrapper chrome={chrome}>page</AdminContentWrapper>);
    expect(screen.queryByTestId('chrome')).not.toBeInTheDocument();
  });
});

describe('LockedSubscriptionRedirect', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSubscription.isFrozen = false;
  });

  it.each(['/sites/demo/admin', '/sites/demo/admin/pos', '/sites/demo/admin/kitchen'])(
    'renvoie un restaurant gele vers l abonnement depuis %s',
    (path) => {
      mockPathname = path;
      mockSubscription.isFrozen = true;
      render(<LockedSubscriptionRedirect tenantSlug="demo" />);
      expect(mockReplace).toHaveBeenCalledWith('/sites/demo/admin/subscription');
    },
  );

  it('laisse la page d abonnement atteignable', () => {
    mockPathname = '/sites/demo/admin/subscription';
    mockSubscription.isFrozen = true;
    render(<LockedSubscriptionRedirect tenantSlug="demo" />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('ne renvoie pas un restaurant qui sert', () => {
    mockPathname = '/sites/demo/admin/pos';
    render(<LockedSubscriptionRedirect tenantSlug="demo" />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // Decision produit du 2026-11-09: a la fin d'un essai pas encore gele, la
  // cuisine finit les commandes d'avant la fin d'essai. Seule la cuisine s'ouvre.
  it.each(['/sites/demo/admin/kitchen', '/sites/demo/admin/kitchen/'])(
    'fin d essai: laisse la cuisine atteignable (%s)',
    (path) => {
      mockPathname = path;
      mockSubscription.isFrozen = true;
      render(<LockedSubscriptionRedirect tenantSlug="demo" kitchenMayFinish />);
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/sites/demo/admin',
    '/sites/demo/admin/pos',
    '/sites/demo/admin/orders',
    '/sites/demo/admin/kitchen-settings',
  ])('fin d essai: renvoie quand meme vers l abonnement depuis %s', (path) => {
    mockPathname = path;
    mockSubscription.isFrozen = true;
    render(<LockedSubscriptionRedirect tenantSlug="demo" kitchenMayFinish />);
    expect(mockReplace).toHaveBeenCalledWith('/sites/demo/admin/subscription');
  });
});
