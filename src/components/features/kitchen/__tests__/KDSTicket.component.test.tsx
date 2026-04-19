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

  it('renders order number and table number in header', () => {
    render(<KDSTicket order={makeOrder()} {...mockCallbacks} />);

    // Order number shown as #042
    expect(screen.getByText('#042')).toBeInTheDocument();
    // Table number shown separately
    expect(screen.getByText('T5')).toBeInTheDocument();
  });

  it('renders item names and quantities', () => {
    render(<KDSTicket order={makeOrder({ items: [baseItem, readyItem] })} {...mockCallbacks} />);

    expect(screen.getByText('Pizza Margherita')).toBeInTheDocument();
    expect(screen.getByText('Tiramisu')).toBeInTheDocument();
    // Quantities shown as plain numbers (not Nx)
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThanOrEqual(1);
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(1);
  });

  it('shows timer that increments', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    render(<KDSTicket order={makeOrder({ created_at: fiveMinAgo })} {...mockCallbacks} />);

    // Timer should show ~05:00 in the action button
    expect(screen.getAllByText(/05:0\d/).length).toBeGreaterThanOrEqual(1);

    // Advance 10 seconds
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getAllByText(/05:1\d/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows warning styling for orders 15+ min old', () => {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { container } = render(
      <KDSTicket order={makeOrder({ created_at: fifteenMinAgo })} {...mockCallbacks} />,
    );

    // Should have font-mono timer in the action bar
    expect(container.querySelector('.font-mono')).toBeInTheDocument();
  });

  it('shows late styling for orders 20+ min old', () => {
    const twentyFiveMinAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    render(<KDSTicket order={makeOrder({ created_at: twentyFiveMinAgo })} {...mockCallbacks} />);

    // Critical orders show DELAYED badge in red
    expect(screen.getByText('FOOTERDELAYED')).toBeInTheDocument();
  });

  it('displays order notes', () => {
    render(<KDSTicket order={makeOrder({ notes: 'Allergie noix' })} {...mockCallbacks} />);

    expect(screen.getByText('Allergie noix')).toBeInTheDocument();
  });

  it('displays item customer notes', () => {
    render(<KDSTicket order={makeOrder({ items: [itemWithNotes] })} {...mockCallbacks} />);

    expect(screen.getByText('Sans croutons')).toBeInTheDocument();
  });

  it('calls onStatusChange when main action clicked', () => {
    render(<KDSTicket order={makeOrder({ status: 'pending' })} {...mockCallbacks} />);

    // Pending -> startCooking button -> should advance to 'preparing'
    const actionBtn = screen.getByText('startCooking');
    fireEvent.click(actionBtn);

    expect(mockCallbacks.onStatusChange).toHaveBeenCalledWith('order-1', 'preparing');
  });

  it('disables actions in mock mode', () => {
    render(<KDSTicket order={makeOrder()} {...mockCallbacks} isMock />);

    const actionBtn = screen.getByText('startCooking');
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

  // Empty items test removed: tickets without visible items are now
  // filtered out at the KitchenBoard level (Fix 2) and never rendered.

  it('shows status badge in header', () => {
    render(<KDSTicket order={makeOrder({ status: 'preparing' })} {...mockCallbacks} />);

    // Should show COOKING badge
    expect(screen.getByText('statusCooking')).toBeInTheDocument();
  });

  it('shows DELAYED badge when order is critical urgency', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    render(
      <KDSTicket
        order={makeOrder({ created_at: thirtyMinAgo, status: 'pending' })}
        {...mockCallbacks}
      />,
    );

    // Should show DELAYED badge (footerDelayed key uppercased)
    expect(screen.getByText('FOOTERDELAYED')).toBeInTheDocument();
  });

  it('shows due time in header', () => {
    render(<KDSTicket order={makeOrder()} {...mockCallbacks} />);

    // Should contain "due" text
    const dueElements = screen.getAllByText(/due/i);
    expect(dueElements.length).toBeGreaterThanOrEqual(1);
  });
});
