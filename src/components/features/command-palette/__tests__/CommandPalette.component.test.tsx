// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';

// ─── Mocks ──────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ site: 'test-tenant' }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockPermissions = {
  canManageMenus: true,
  canManageUsers: true,
  canManageSettings: true,
  canTakeOrders: true,
  canViewOrders: true,
  canViewStocks: true,
  canManageStocks: true,
  canConfigurePOS: true,
  canConfigureKitchen: true,
  canViewAllStats: true,
  canManageOrders: true,
};

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    role: 'admin',
    permissions: mockPermissions,
    can: (key: string) => mockPermissions[key as keyof typeof mockPermissions] ?? false,
  }),
}));

// ─── Tests ──────────────────────────────────────────────

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
    mockPermissions.canTakeOrders = false;
    mockPermissions.canManageMenus = false;
    mockPermissions.canManageUsers = false;

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
});
