import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndNotifyLowStock } from '../notification.service';

// Mock createAdminClient
const mockFrom = vi.fn();
const mockSupabase = {
  from: mockFrom,
};

// `push.service` (desormais dans ce graphe d imports) declare `server-only`.
vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}));

// Mock email service
const mockSendStockAlertEmail = vi.fn();
vi.mock('@/services/email.service', () => ({
  sendStockAlertEmail: (...args: unknown[]) => mockSendStockAlertEmail(...args),
}));

function setupChain(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: undefined, // Resolve as final value
  };
}

// The ingredients query is terminal at .eq('is_active', true) - no .or() / column
// comparison (that was the C1 bug: PostgREST cannot compare current_stock to the
// min_stock_alert column). The builder is awaited directly, so it must be thenable.
function ingredientsChain(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown; error: unknown }) => void) => resolve({ data, error }),
  };
  return chain;
}

describe('checkAndNotifyLowStock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when no low stock ingredients', async () => {
    const chain = ingredientsChain([]);
    mockFrom.mockReturnValue(chain);

    await checkAndNotifyLowStock('tenant-1');
    expect(mockSendStockAlertEmail).not.toHaveBeenCalled();
    // Regression guard for C1: must NOT use a column-vs-column .or() filter
    expect(chain.or).not.toHaveBeenCalled();
  });

  it('returns early on ingredient fetch error', async () => {
    const chain = ingredientsChain(null, { message: 'DB error' });
    mockFrom.mockReturnValue(chain);

    await checkAndNotifyLowStock('tenant-1');
    expect(mockSendStockAlertEmail).not.toHaveBeenCalled();
  });

  it('filters already-notified ingredients (1hr rate limit)', async () => {
    const lowStockItems = [
      { id: 'ing-1', name: 'Salt', unit: 'kg', current_stock: 0, min_stock_alert: 5 },
      { id: 'ing-2', name: 'Pepper', unit: 'kg', current_stock: 2, min_stock_alert: 10 },
    ];

    let callIndex = 0;
    let adminCallIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        return ingredientsChain(lowStockItems);
      }
      if (table === 'stock_alert_notifications') {
        if (callIndex === 0) {
          callIndex++;
          // Rate limit: ing-1 was already notified
          const chain = setupChain(null);
          chain.gte.mockResolvedValue({ data: [{ ingredient_id: 'ing-1' }], error: null });
          return chain;
        }
        // Insert call
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      if (table === 'admin_users') {
        if (adminCallIndex === 0) {
          adminCallIndex++;
          // First call: fetch user_ids
          const chain = setupChain(null);
          chain.eq.mockResolvedValue({ data: [{ user_id: 'user-1' }], error: null });
          return chain;
        }
        // Second call: fetch emails
        const chain = setupChain(null);
        chain.not.mockResolvedValue({ data: [{ email: 'admin@test.com' }], error: null });
        return chain;
      }
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: 'Test Restaurant', slug: 'test-restaurant' },
            error: null,
          }),
        };
      }
      return setupChain(null);
    });

    mockSendStockAlertEmail.mockResolvedValue(true);

    await checkAndNotifyLowStock('tenant-1');

    // Only Pepper should be in the email (Salt was rate-limited)
    expect(mockSendStockAlertEmail).toHaveBeenCalledWith(
      ['admin@test.com'],
      expect.objectContaining({
        items: expect.arrayContaining([expect.objectContaining({ name: 'Pepper' })]),
      }),
    );
  });

  it('returns early when no admin users exist', async () => {
    const lowStockItems = [
      { id: 'ing-1', name: 'Salt', unit: 'kg', current_stock: 0, min_stock_alert: 5 },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        return ingredientsChain(lowStockItems);
      }
      if (table === 'stock_alert_notifications') {
        const chain = setupChain(null);
        chain.gte.mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === 'admin_users') {
        // First call returns empty admin users list
        const chain = setupChain(null);
        chain.eq.mockResolvedValue({ data: [], error: null });
        return chain;
      }
      return setupChain(null);
    });

    await checkAndNotifyLowStock('tenant-1');
    expect(mockSendStockAlertEmail).not.toHaveBeenCalled();
  });

  it('handles email send failure gracefully', async () => {
    const lowStockItems = [
      { id: 'ing-1', name: 'Salt', unit: 'kg', current_stock: 0, min_stock_alert: 5 },
    ];

    let adminCallIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        return ingredientsChain(lowStockItems);
      }
      if (table === 'stock_alert_notifications') {
        const chain = setupChain(null);
        chain.gte.mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === 'admin_users') {
        if (adminCallIndex === 0) {
          adminCallIndex++;
          const chain = setupChain(null);
          chain.eq.mockResolvedValue({ data: [{ user_id: 'user-1' }], error: null });
          return chain;
        }
        const chain = setupChain(null);
        chain.not.mockResolvedValue({ data: [{ email: 'admin@test.com' }], error: null });
        return chain;
      }
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: 'Test', slug: 'test' },
            error: null,
          }),
        };
      }
      return setupChain(null);
    });

    mockSendStockAlertEmail.mockResolvedValue(false);

    // Should not throw, just return
    await expect(checkAndNotifyLowStock('tenant-1')).resolves.toBeUndefined();
  });

  it('sends email with correct recipients and items', async () => {
    const lowStockItems = [
      { id: 'ing-1', name: 'Salt', unit: 'kg', current_stock: 0, min_stock_alert: 5 },
    ];

    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

    let adminCallIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        return ingredientsChain(lowStockItems);
      }
      if (table === 'stock_alert_notifications') {
        // First call: rate limit check; Second call: insert
        const chain = setupChain(null);
        chain.gte.mockResolvedValue({ data: [], error: null });
        chain.insert = insertMock;
        return chain;
      }
      if (table === 'admin_users') {
        if (adminCallIndex === 0) {
          adminCallIndex++;
          const chain = setupChain(null);
          chain.eq.mockResolvedValue({
            data: [{ user_id: 'user-1' }, { user_id: 'user-2' }] as unknown[],
            error: null,
          });
          return chain;
        }
        const chain = setupChain(null);
        chain.not.mockResolvedValue({
          data: [{ email: 'admin1@test.com' }, { email: 'admin2@test.com' }],
          error: null,
        });
        return chain;
      }
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: 'Test Restaurant', slug: 'test-restaurant' },
            error: null,
          }),
        };
      }
      return setupChain(null);
    });

    mockSendStockAlertEmail.mockResolvedValue(true);

    await checkAndNotifyLowStock('tenant-1');

    expect(mockSendStockAlertEmail).toHaveBeenCalledWith(
      ['admin1@test.com', 'admin2@test.com'],
      expect.objectContaining({
        tenantName: 'Test Restaurant',
        items: [
          expect.objectContaining({
            name: 'Salt',
            is_out: true,
          }),
        ],
      }),
    );
  });

  it('records notifications after successful email send', async () => {
    const lowStockItems = [
      { id: 'ing-1', name: 'Salt', unit: 'kg', current_stock: 0, min_stock_alert: 5 },
    ];

    const insertMock = vi.fn().mockResolvedValue({ data: null, error: null });

    let adminCallIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        return ingredientsChain(lowStockItems);
      }
      if (table === 'stock_alert_notifications') {
        const chain = setupChain(null);
        chain.gte.mockResolvedValue({ data: [], error: null });
        chain.insert = insertMock;
        return chain;
      }
      if (table === 'admin_users') {
        if (adminCallIndex === 0) {
          adminCallIndex++;
          const chain = setupChain(null);
          chain.eq.mockResolvedValue({ data: [{ user_id: 'user-1' }], error: null });
          return chain;
        }
        const chain = setupChain(null);
        chain.not.mockResolvedValue({ data: [{ email: 'admin@test.com' }], error: null });
        return chain;
      }
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { name: 'Test', slug: 'test' },
            error: null,
          }),
        };
      }
      return setupChain(null);
    });

    mockSendStockAlertEmail.mockResolvedValue(true);

    await checkAndNotifyLowStock('tenant-1');

    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        tenant_id: 'tenant-1',
        ingredient_id: 'ing-1',
        alert_type: 'out_of_stock',
        sent_to: ['admin@test.com'],
      }),
    ]);
  });
});

describe('notifyDestockFailed', () => {
  /**
   * The dish goes out whether or not the deduction worked. If nobody is told,
   * the gap is only found at the next physical count - with no way to know which
   * order caused it. And in a rush with one ingredient at zero EVERY order fails,
   * so the warning has to be told once, not fifty times.
   */
  const insertSpy = vi.fn().mockResolvedValue({ error: null });

  function wire(opts: { orderNumber?: string | null; recent?: unknown[] }) {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: { order_number: opts.orderNumber ?? 'CMD-7' } }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        like: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: opts.recent ?? [], error: null }),
        insert: insertSpy,
      };
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    insertSpy.mockClear();
  });

  it('warns the restaurant, naming the order and pointing at the history', async () => {
    const { notifyDestockFailed } = await import('../notification.service');
    wire({ orderNumber: 'CMD-7' });

    await notifyDestockFailed({ tenantId: 'tenant-1', orderId: 'order-1', outOfStock: true });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.tenant_id).toBe('tenant-1');
    expect(row.title).toContain('CMD-7');
    expect(row.body).toContain('insuffisant');
    expect(row.link).toBe('/inventory');
  });

  it('says it plainly when the cause is not a stock shortage', async () => {
    const { notifyDestockFailed } = await import('../notification.service');
    wire({});

    await notifyDestockFailed({ tenantId: 'tenant-1', orderId: 'order-2', outOfStock: false });

    const row = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(row.body).not.toContain('insuffisant');
  });

  it('stays silent when the same warning was already raised recently', async () => {
    const { notifyDestockFailed } = await import('../notification.service');
    wire({ recent: [{ id: 'notif-existing' }] });

    await notifyDestockFailed({ tenantId: 'tenant-1', orderId: 'order-3', outOfStock: true });

    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('never throws, even when the database is unreachable', async () => {
    const { notifyDestockFailed } = await import('../notification.service');
    mockFrom.mockImplementation(() => {
      throw new Error('connection refused');
    });

    await expect(
      notifyDestockFailed({ tenantId: 'tenant-1', orderId: 'order-4', outOfStock: false }),
    ).resolves.toBeUndefined();
  });
});
