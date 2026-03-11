// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationCenter } from '../NotificationCenter';
import type { Notification } from '@/hooks/useNotifications';

// ─── Mocks ──────────────────────────────────────────────

const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();
const mockNotifications: Notification[] = [];

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: mockNotifications.filter((n) => !n.read).length,
    isLoading: false,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
  }),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ site: 'test-tenant' }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values) {
      let result = key;
      for (const [k, v] of Object.entries(values)) {
        result = result.replace(`{${k}}`, String(v));
      }
      return result;
    }
    return key;
  },
}));

vi.mock('@/contexts/SoundContext', () => ({
  useSound: () => ({
    soundEnabled: true,
    toggleSound: vi.fn(),
    play: vi.fn(),
    preview: vi.fn(),
    currentSoundId: 'classic-bell',
    setSoundId: vi.fn(),
    audioRef: { current: null },
  }),
}));

// ─── requestAnimationFrame mock (happy-dom doesn't fire callbacks) ───

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

// ─── Helpers ────────────────────────────────────────────

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    type: 'info',
    title: 'New order received',
    body: 'Table 5 placed an order',
    link: '/orders/abc123',
    read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────

describe('NotificationCenter', () => {
  beforeEach(() => {
    mockNotifications.length = 0;
    mockMarkAsRead.mockClear();
    mockMarkAllAsRead.mockClear();
    mockPush.mockClear();
  });

  it('renders bell icon button', () => {
    render(<NotificationCenter tenantId="tenant-1" userId="user-1" />);

    expect(screen.getByRole('button', { name: 'title' })).toBeInTheDocument();
  });

  it('shows unread badge count', () => {
    mockNotifications.push(
      makeNotification({ id: 'n1', read: false }),
      makeNotification({ id: 'n2', read: false }),
      makeNotification({ id: 'n3', read: true }),
    );

    render(<NotificationCenter tenantId="tenant-1" userId="user-1" />);

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('does not show badge when all read', () => {
    mockNotifications.push(makeNotification({ id: 'n1', read: true }));

    const { container } = render(<NotificationCenter tenantId="tenant-1" userId="user-1" />);

    // No badge span with count
    const badges = container.querySelectorAll('.bg-red-500');
    expect(badges.length).toBe(0);
  });

  it('shows empty state when no notifications', async () => {
    const user = userEvent.setup();
    render(<NotificationCenter tenantId="tenant-1" userId="user-1" />);

    await user.click(screen.getByRole('button', { name: 'title' }));

    await waitFor(() => {
      expect(screen.getByText('empty')).toBeInTheDocument();
    });
  });

  it('shows notification items in dropdown', async () => {
    mockNotifications.push(
      makeNotification({ id: 'n1', title: 'New order', read: false }),
      makeNotification({ id: 'n2', title: 'Stock alert', type: 'warning', read: true }),
    );

    const user = userEvent.setup();
    render(<NotificationCenter tenantId="tenant-1" userId="user-1" />);

    await user.click(screen.getByRole('button', { name: 'title' }));

    await waitFor(() => {
      expect(screen.getByText('New order')).toBeInTheDocument();
      expect(screen.getByText('Stock alert')).toBeInTheDocument();
    });
  });

  it('marks notification as read and navigates on click', async () => {
    mockNotifications.push(
      makeNotification({ id: 'n1', title: 'New order', link: '/orders/abc', read: false }),
    );

    const user = userEvent.setup();
    render(<NotificationCenter tenantId="tenant-1" userId="user-1" />);

    await user.click(screen.getByRole('button', { name: 'title' }));

    await waitFor(() => {
      expect(screen.getByText('New order')).toBeInTheDocument();
    });

    await user.click(screen.getByText('New order'));

    expect(mockMarkAsRead).toHaveBeenCalledWith('n1');
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/sites/test-tenant/admin/orders/abc');
    });
  });

  it('shows mark-all-read button when unread notifications exist', async () => {
    mockNotifications.push(makeNotification({ id: 'n1', read: false }));

    const user = userEvent.setup();
    render(<NotificationCenter tenantId="tenant-1" userId="user-1" />);

    await user.click(screen.getByRole('button', { name: 'title' }));

    await waitFor(() => {
      expect(screen.getByText('markAllRead')).toBeInTheDocument();
    });

    await user.click(screen.getByText('markAllRead'));
    expect(mockMarkAllAsRead).toHaveBeenCalled();
  });

  it('caps badge at 99+', () => {
    for (let i = 0; i < 150; i++) {
      mockNotifications.push(makeNotification({ id: `n${i}`, read: false }));
    }

    render(<NotificationCenter tenantId="tenant-1" userId="user-1" />);

    expect(screen.getByText('99+')).toBeInTheDocument();
  });
});
