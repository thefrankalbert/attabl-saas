// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { OutboxEntry } from '@/lib/offline/outbox';

// Translations return the key so we can assert on stable identifiers.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockNetwork = vi.fn();
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetwork(),
}));

const mockOutbox = vi.fn();
vi.mock('@/hooks/useOrderOutbox', () => ({
  useOrderOutbox: () => mockOutbox(),
}));

import { StorefrontOfflineIndicator } from '../client/StorefrontOfflineIndicator';

const entry = (id: string): OutboxEntry =>
  ({ id, endpoint: '/api/orders', body: {}, enqueuedAt: 0, attempts: 0 }) as unknown as OutboxEntry;

describe('StorefrontOfflineIndicator', () => {
  const dismissRejected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockNetwork.mockReturnValue({ isOnline: true, wasOffline: false });
    mockOutbox.mockReturnValue({ pending: 0, rejected: [], dismissRejected, flush: vi.fn() });
  });

  it('renders nothing when online with nothing pending', () => {
    const { container } = render(<StorefrontOfflineIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the offline notice when offline', () => {
    mockNetwork.mockReturnValue({ isOnline: false, wasOffline: true });
    render(<StorefrontOfflineIndicator />);
    expect(screen.getByText('offlineNotice')).toBeInTheDocument();
  });

  it('shows the connection-restored notice after reconnect', () => {
    mockNetwork.mockReturnValue({ isOnline: true, wasOffline: true });
    render(<StorefrontOfflineIndicator />);
    expect(screen.getByText('connectionRestored')).toBeInTheDocument();
  });

  it('shows the pending-sync banner when orders are queued', () => {
    mockOutbox.mockReturnValue({
      pending: 2,
      rejected: [],
      dismissRejected,
      flush: vi.fn(),
    });
    render(<StorefrontOfflineIndicator />);
    expect(screen.getByText('orderQueued')).toBeInTheDocument();
  });

  it('shows the rejected banner and dismisses on click', () => {
    mockOutbox.mockReturnValue({
      pending: 0,
      rejected: [entry('a'), entry('b')],
      dismissRejected,
      flush: vi.fn(),
    });
    render(<StorefrontOfflineIndicator />);
    const btn = screen.getByRole('button', { name: 'close' });
    expect(screen.getByText('orderQueuedFailed')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(dismissRejected).toHaveBeenCalledTimes(1);
  });
});
