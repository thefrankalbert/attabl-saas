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

import { PERMISSION_CODES, type PermissionCode } from '@/types/permission.types';

const mockPermissions = Object.fromEntries(PERMISSION_CODES.map((c) => [c, true])) as Record<
  PermissionCode,
  boolean
>;

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    role: 'admin',
    permissions: mockPermissions,
    can: (key: PermissionCode) => mockPermissions[key] === true,
  }),
}));

// --- Tests ----------------------------------------------

describe('CommandPalette', () => {
  beforeEach(() => {
    mockPush.mockClear();
    // Reset all permissions to true
    Object.keys(mockPermissions).forEach((key) => {
      mockPermissions[key as keyof typeof mockPermissions] = true;
    });
  });

  it('renders without crash (closed by default)', () => {
    const { container } = render(<CommandPalette />);
    // Dialog should be in DOM but not visible (closed)
    expect(container).toBeDefined();
  });

  it('opens on Cmd+K keyboard shortcut', async () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('placeholder')).toBeInTheDocument();
    });
  });

  it('opens on Ctrl+K keyboard shortcut', async () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('placeholder')).toBeInTheDocument();
    });
  });

  it('shows quick actions when permitted', async () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('newOrder')).toBeInTheDocument();
      expect(screen.getByText('addDish')).toBeInTheDocument();
      expect(screen.getByText('inviteUser')).toBeInTheDocument();
    });
  });

  it('hides quick actions when permissions are missing', async () => {
    mockPermissions['pos.use'] = false;
    mockPermissions['menu.edit'] = false;
    mockPermissions['team.manage'] = false;

    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('placeholder')).toBeInTheDocument();
    });

    expect(screen.queryByText('newOrder')).not.toBeInTheDocument();
    expect(screen.queryByText('addDish')).not.toBeInTheDocument();
    expect(screen.queryByText('inviteUser')).not.toBeInTheDocument();
  });

  it('shows navigation items', async () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      // Nav items from NAV_GROUPS - dashboard should always be visible
      expect(screen.getByText('navDashboard')).toBeInTheDocument();
    });
  });

  it('navigates on item select', async () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('navDashboard')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('navDashboard'));

    expect(mockPush).toHaveBeenCalledWith('/sites/test-tenant/admin');
  });

  it('shows settings/users when permitted', async () => {
    render(<CommandPalette />);

    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('settings')).toBeInTheDocument();
      expect(screen.getByText('users')).toBeInTheDocument();
    });
  });

  // Chef par defaut: la palette lisait l'ancienne matrice et lui proposait
  // "Ajouter un plat", "Nouvelle commande" et "Rapports", trois refus serveur.
  it('follows the effective permissions of a chef (no POS, no menu edit, no reports)', async () => {
    mockPermissions['pos.use'] = false;
    mockPermissions['menu.edit'] = false;
    mockPermissions['reports.view'] = false;
    mockPermissions['settings.view'] = false;
    mockPermissions['team.view'] = false;
    mockPermissions['team.manage'] = false;

    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('navDashboard')).toBeInTheDocument();
    });
    expect(screen.queryByText('newOrder')).not.toBeInTheDocument();
    expect(screen.queryByText('addDish')).not.toBeInTheDocument();
    expect(screen.queryByText('navReports')).not.toBeInTheDocument();
    expect(screen.queryByText('navPos')).not.toBeInTheDocument();
    expect(screen.queryByText('settings')).not.toBeInTheDocument();
    expect(screen.queryByText('users')).not.toBeInTheDocument();
    // Ce que ses permissions ouvrent reste propose.
    expect(screen.getByText('navInventory')).toBeInTheDocument();
  });

  // Un gerant (menu.edit) ouvre Annonces/Coupons: l'ancienne matrice les cachait.
  it('lists a route as soon as its route permission is held', async () => {
    mockPermissions['settings.edit'] = false;
    mockPermissions['settings.view'] = false;

    render(<CommandPalette />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('navAnnouncements')).toBeInTheDocument();
    });
    expect(screen.getByText('navCoupons')).toBeInTheDocument();
  });
});
