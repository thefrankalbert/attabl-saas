// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';

// --- Mocks ----------------------------------------------

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ site: 'test-tenant' }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { PermissionsProvider } from '@/contexts/PermissionsContext';
import { getEffectiveLevels } from '@/lib/permissions';
import type { PermissionMap, Poste } from '@/types/permission.types';

// Niveaux toujours calcules par la vraie resolution des droits.
function renderPalette(poste: Poste = 'manager', overrides: PermissionMap = {}) {
  const levels = getEffectiveLevels({ postes: [poste], permission_overrides: overrides });
  return render(
    <PermissionsProvider postes={[poste]} levels={levels}>
      <CommandPalette />
    </PermissionsProvider>,
  );
}

// --- Tests ----------------------------------------------

describe('CommandPalette', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders without crash (closed by default)', () => {
    const { container } = renderPalette();
    // Dialog should be in DOM but not visible (closed)
    expect(container).toBeDefined();
  });

  it('opens on Cmd+K keyboard shortcut', async () => {
    renderPalette();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('placeholder')).toBeInTheDocument();
    });
  });

  it('opens on Ctrl+K keyboard shortcut', async () => {
    renderPalette();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('placeholder')).toBeInTheDocument();
    });
  });

  it('shows quick actions when permitted', async () => {
    renderPalette();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('newOrder')).toBeInTheDocument();
      expect(screen.getByText('addDish')).toBeInTheDocument();
      expect(screen.getByText('inviteUser')).toBeInTheDocument();
    });
  });

  it('hides quick actions when permissions are missing', async () => {
    // Temoin du cas "permis" ci-dessus: meme palette, trois droits retires.
    renderPalette('manager', {
      'orders.take': false,
      'menu.edit': false,
      'team.manage': false,
    });

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('placeholder')).toBeInTheDocument();
    });

    expect(screen.queryByText('newOrder')).not.toBeInTheDocument();
    expect(screen.queryByText('addDish')).not.toBeInTheDocument();
    expect(screen.queryByText('inviteUser')).not.toBeInTheDocument();
  });

  it('shows navigation items', async () => {
    renderPalette();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      // Nav items from NAV_GROUPS - dashboard should always be visible
      expect(screen.getByText('navDashboard')).toBeInTheDocument();
    });
  });

  it('navigates on item select', async () => {
    renderPalette();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('navDashboard')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('navDashboard'));

    expect(mockPush).toHaveBeenCalledWith('/sites/test-tenant/admin');
  });

  it('shows settings/users when permitted', async () => {
    renderPalette();

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('settings')).toBeInTheDocument();
      expect(screen.getByText('users')).toBeInTheDocument();
    });
  });

  // Chef par defaut: la palette lisait l'ancienne matrice et lui proposait
  // "Nouvelle commande" et "Rapports", deux refus serveur. Il garde "Ajouter un
  // plat" (menu.edit).
  it('follows the effective permissions of a chef (no order, no reports, no settings)', async () => {
    renderPalette('chef');
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('navDashboard')).toBeInTheDocument();
    });
    expect(screen.queryByText('newOrder')).not.toBeInTheDocument();
    expect(screen.getByText('addDish')).toBeInTheDocument();
    expect(screen.queryByText('navReports')).not.toBeInTheDocument();
    expect(screen.queryByText('navPos')).not.toBeInTheDocument();
    expect(screen.queryByText('settings')).not.toBeInTheDocument();
    expect(screen.queryByText('users')).not.toBeInTheDocument();
    // Ce que ses permissions ouvrent reste propose.
    expect(screen.getByText('navInventory')).toBeInTheDocument();
  });

  // Annonces = settings.edit, coupons = orders.discount: chaque route suit SON droit.
  it('lists a route as soon as its route permission is held', async () => {
    renderPalette('manager', { 'settings.edit': false });
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('navCoupons')).toBeInTheDocument();
    });
    expect(screen.queryByText('navAnnouncements')).not.toBeInTheDocument();
  });

  it('temoin: le gerant avec settings.edit voit Annonces', async () => {
    renderPalette('manager');
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('navAnnouncements')).toBeInTheDocument();
    });
  });
});
