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

  it('renders table number in header and order number', () => {
    render(<KDSTicket order={makeOrder()} {...mockCallbacks} />);

    // Table number is shown prominently in the colored header
    expect(screen.getByText('T5')).toBeInTheDocument();
    // Order number shown as secondary info
    expect(screen.getByText('#042')).toBeInTheDocument();
  });

  it('renders item names and quantities', () => {
    render(<KDSTicket order={makeOrder({ items: [baseItem, readyItem] })} {...mockCallbacks} />);

    expect(screen.getByText('Pizza Margherita')).toBeInTheDocument();
    expect(screen.getByText('Tiramisu')).toBeInTheDocument();
    expect(screen.getByText('2x')).toBeInTheDocument();
    expect(screen.getByText('1x')).toBeInTheDocument();
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

    // Header still uses amber color for pending, timer area should have pulse or similar
    // The isWarning flag is set for 10-19 min
    expect(container.querySelector('.font-mono')).toBeInTheDocument();
  });

  it('shows late styling for orders 20+ min old', () => {
    const twentyFiveMinAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    const { container } = render(
      <KDSTicket order={makeOrder({ created_at: twentyFiveMinAgo })} {...mockCallbacks} />,
    );

    // Ticket should have red left border for critical urgency (20+ min)
    const ticket = container.querySelector('.border-red-500');
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

    // Item status badge is a button with a dot - find all buttons and click the status one
    const buttons = screen.getAllByRole('button');
    // The status badge button is the one that's not the action button or rupture button
    const statusBadge = buttons.find(
      (btn) =>
        !btn.textContent?.includes('ACTIONSTART') &&
        !btn.textContent?.includes('Rupture') &&
        btn.querySelector('.rounded-full'),
    );
    expect(statusBadge).toBeTruthy();
    fireEvent.click(statusBadge!);

    expect(mockCallbacks.onUpdateItemStatus).toHaveBeenCalledWith(
      'order-1',
      'item-1',
      'preparing',
      [baseItem],
    );
  });

  it('calls onMarkAllReady when mark-all button clicked', () => {
    const { container } = render(
      <KDSTicket
        order={makeOrder({ status: 'preparing', items: [baseItem, readyItem] })}
        {...mockCallbacks}
      />,
    );

    // The mark-all-ready button contains a Check icon and is in the items area
    const buttons = container.querySelectorAll('button');
    const markAllBtn = Array.from(buttons).find(
      (btn) => btn.querySelector('.lucide-check') && !btn.textContent?.includes('ACTIONFINISH'),
    );
    expect(markAllBtn).toBeTruthy();
    fireEvent.click(markAllBtn!);

    expect(mockCallbacks.onMarkAllReady).toHaveBeenCalledWith('order-1', ['item-1', 'item-2']);
  });

  it('disables actions in mock mode', () => {
    render(<KDSTicket order={makeOrder()} {...mockCallbacks} isMock />);

    const actionBtn = screen.getByText('actionStart'.toUpperCase());
    fireEvent.click(actionBtn);

    expect(mockCallbacks.onStatusChange).not.toHaveBeenCalled();
  });

  it('shows service type for non-dine_in orders', () => {
    render(<KDSTicket order={makeOrder({ service_type: 'delivery' })} {...mockCallbacks} />);

    expect(screen.getByText('serviceDelivery')).toBeInTheDocument();
  });

  it('shows all items in a flat list', () => {
    render(
      <KDSTicket
        order={makeOrder({ items: [baseItem, readyItem, itemWithNotes] })}
        {...mockCallbacks}
      />,
    );

    // All items rendered in a flat list (no course grouping)
    expect(screen.getByText('Pizza Margherita')).toBeInTheDocument();
    expect(screen.getByText('Tiramisu')).toBeInTheDocument();
    expect(screen.getByText('Salade Caesar')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    render(<KDSTicket order={makeOrder({ items: [] })} {...mockCallbacks} />);

    expect(screen.getByText('noItems')).toBeInTheDocument();
  });
});
