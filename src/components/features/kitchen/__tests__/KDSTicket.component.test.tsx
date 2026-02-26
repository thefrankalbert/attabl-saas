// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import KDSTicket from '../KDSTicket';
import type { Order, OrderItem } from '@/types/admin.types';

// ─── Mocks ──────────────────────────────────────────────

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

vi.mock('@/components/admin/RuptureButton', () => ({
  default: () => <button data-testid="rupture-btn">Rupture</button>,
}));

// ─── Test Data ──────────────────────────────────────────

const baseItem: OrderItem = {
  id: 'item-1',
  name: 'Pizza Margherita',
  quantity: 2,
  price: 5000,
  item_status: 'pending',
  course: 'main',
};

const readyItem: OrderItem = {
  id: 'item-2',
  name: 'Tiramisu',
  quantity: 1,
  price: 3000,
  item_status: 'ready',
  course: 'dessert',
};

const itemWithNotes: OrderItem = {
  id: 'item-3',
  name: 'Salade Caesar',
  quantity: 1,
  price: 4000,
  item_status: 'pending',
  course: 'appetizer',
  customer_notes: 'Sans croutons',
};

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    tenant_id: 'tenant-1',
    table_number: 'T5',
    total_price: 12000,
    status: 'pending',
    created_at: new Date().toISOString(),
    order_number: '042',
    items: [baseItem],
    ...overrides,
  };
}

const mockCallbacks = {
  onStatusChange: vi.fn(),
  onUpdateItemStatus: vi.fn().mockResolvedValue(undefined),
  onMarkAllReady: vi.fn().mockResolvedValue(undefined),
  onUpdate: vi.fn(),
};

// ─── Tests ──────────────────────────────────────────────

describe('KDSTicket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(mockCallbacks).forEach((fn) => fn.mockClear());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders order number and table number', () => {
    render(<KDSTicket order={makeOrder()} {...mockCallbacks} />);

    expect(screen.getByText('COMMANDE #042')).toBeInTheDocument();
    expect(screen.getByText('T5')).toBeInTheDocument();
  });

  it('renders item names and quantities', () => {
    render(<KDSTicket order={makeOrder({ items: [baseItem, readyItem] })} {...mockCallbacks} />);

    expect(screen.getByText('Pizza Margherita')).toBeInTheDocument();
    expect(screen.getByText('Tiramisu')).toBeInTheDocument();
    expect(screen.getByText('2 x')).toBeInTheDocument();
    expect(screen.getByText('1 x')).toBeInTheDocument();
  });

  it('shows timer that increments', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(<KDSTicket order={makeOrder({ created_at: fiveMinAgo })} {...mockCallbacks} />);

    // Timer should show ~05:00
    expect(screen.getByText(/05:0\d/)).toBeInTheDocument();

    // Advance 10 seconds
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByText(/05:1\d/)).toBeInTheDocument();
  });

  it('shows warning styling for orders 10-19 min old', () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { container } = render(
      <KDSTicket order={makeOrder({ created_at: fifteenMinAgo })} {...mockCallbacks} />,
    );

    // Timer should have amber color
    const timerDiv = container.querySelector('.text-amber-400');
    expect(timerDiv).toBeInTheDocument();
  });

  it('shows late styling for orders 20+ min old', () => {
    const twentyFiveMinAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const { container } = render(
      <KDSTicket order={makeOrder({ created_at: twentyFiveMinAgo })} {...mockCallbacks} />,
    );

    // Timer should have red color and fire icon
    const timerDiv = container.querySelector('.text-red-400');
    expect(timerDiv).toBeInTheDocument();
    // Ticket should have red ring
    const ticket = container.querySelector('.ring-red-500\\/40');
    expect(ticket).toBeInTheDocument();
  });

  it('displays customer notes with warning icon', () => {
    render(<KDSTicket order={makeOrder({ notes: 'Allergie noix' })} {...mockCallbacks} />);

    expect(screen.getByText('Allergie noix')).toBeInTheDocument();
  });

  it('displays item customer notes', () => {
    render(<KDSTicket order={makeOrder({ items: [itemWithNotes] })} {...mockCallbacks} />);

    expect(screen.getByText('Sans croutons')).toBeInTheDocument();
  });

  it('calls onStatusChange when main action clicked', () => {
    render(<KDSTicket order={makeOrder({ status: 'pending' })} {...mockCallbacks} />);

    // Pending → actionStart button → should advance to 'preparing'
    const actionBtn = screen.getByText('actionStart'.toUpperCase());
    fireEvent.click(actionBtn);

    expect(mockCallbacks.onStatusChange).toHaveBeenCalledWith('order-1', 'preparing');
  });

  it('calls onUpdateItemStatus when item status badge clicked', () => {
    render(<KDSTicket order={makeOrder()} {...mockCallbacks} />);

    // Item is 'pending', clicking should cycle to 'preparing'
    const statusBadge = screen.getByText('itemPending');
    fireEvent.click(statusBadge);

    expect(mockCallbacks.onUpdateItemStatus).toHaveBeenCalledWith(
      'order-1',
      'item-1',
      'preparing',
      [baseItem],
    );
  });

  it('calls onMarkAllReady when "all ready" button clicked', () => {
    render(
      <KDSTicket
        order={makeOrder({ status: 'preparing', items: [baseItem, readyItem] })}
        {...mockCallbacks}
      />,
    );

    const allReadyBtn = screen.getByText('actionAllReady');
    fireEvent.click(allReadyBtn);

    expect(mockCallbacks.onMarkAllReady).toHaveBeenCalledWith('order-1', ['item-1', 'item-2']);
  });

  it('disables actions in mock mode', () => {
    render(<KDSTicket order={makeOrder()} {...mockCallbacks} isMock />);

    const actionBtn = screen.getByText('actionStart'.toUpperCase());
    fireEvent.click(actionBtn);

    expect(mockCallbacks.onStatusChange).not.toHaveBeenCalled();
  });

  it('shows progress bar when items are ready', () => {
    const { container } = render(
      <KDSTicket order={makeOrder({ items: [baseItem, readyItem] })} {...mockCallbacks} />,
    );

    // 1 of 2 items ready → "1/2"
    expect(screen.getByText('1/2')).toBeInTheDocument();
    // Progress bar should exist
    const progressBar = container.querySelector('[style*="width: 50%"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('shows service type badge', () => {
    render(<KDSTicket order={makeOrder({ service_type: 'delivery' })} {...mockCallbacks} />);

    expect(screen.getByText('serviceDelivery')).toBeInTheDocument();
  });

  it('groups items by course with labels', () => {
    render(
      <KDSTicket
        order={makeOrder({ items: [baseItem, readyItem, itemWithNotes] })}
        {...mockCallbacks}
      />,
    );

    // Multiple courses → shows course headers
    expect(screen.getByText('courseStarters')).toBeInTheDocument();
    expect(screen.getByText('courseMains')).toBeInTheDocument();
    expect(screen.getByText('courseDesserts')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    render(<KDSTicket order={makeOrder({ items: [] })} {...mockCallbacks} />);

    expect(screen.getByText('noItems')).toBeInTheDocument();
  });
});
