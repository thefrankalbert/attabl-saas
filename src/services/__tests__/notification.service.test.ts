import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkAndNotifyLowStock } from '../notification.service';

// Mock createAdminClient
const mockFrom = vi.fn();
const mockAuth = {
  admin: {
    getUserById: vi.fn(),
  },
};
const mockSupabase = {
  from: mockFrom,
  auth: mockAuth,
};

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
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: undefined, // Resolve as final value
  };
}

describe('checkAndNotifyLowStock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early when no low stock ingredients', async () => {
    const chain = setupChain(null);
    // Override or() to resolve with empty array
    chain.or.mockResolvedValue({ data: [], error: null });
    mockFrom.mockReturnValue(chain);

    await checkAndNotifyLowStock('tenant-1');
    expect(mockSendStockAlertEmail).not.toHaveBeenCalled();
  });

  it('returns early on ingredient fetch error', async () => {
    const chain = setupChain(null);
    chain.or.mockResolvedValue({ data: null, error: { message: 'DB error' } });
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
    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        const chain = setupChain(null);
        chain.or.mockResolvedValue({ data: lowStockItems, error: null });
        return chain;
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
        const chain = setupChain(null);
        chain.eq.mockResolvedValue({ data: [{ user_id: 'user-1' }], error: null });
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

    mockAuth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'admin@test.com' } },
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
        const chain = setupChain(null);
        chain.or.mockResolvedValue({ data: lowStockItems, error: null });
        return chain;
      }
      if (table === 'stock_alert_notifications') {
        const chain = setupChain(null);
        chain.gte.mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === 'admin_users') {
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

    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        const chain = setupChain(null);
        chain.or.mockResolvedValue({ data: lowStockItems, error: null });
        return chain;
      }
      if (table === 'stock_alert_notifications') {
        const chain = setupChain(null);
        chain.gte.mockResolvedValue({ data: [], error: null });
        return chain;
      }
      if (table === 'admin_users') {
        const chain = setupChain(null);
        chain.eq.mockResolvedValue({ data: [{ user_id: 'user-1' }], error: null });
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

    mockAuth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'admin@test.com' } },
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

    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        const chain = setupChain(null);
        chain.or.mockResolvedValue({ data: lowStockItems, error: null });
        return chain;
      }
      if (table === 'stock_alert_notifications') {
        // First call: rate limit check; Second call: insert
        const chain = setupChain(null);
        chain.gte.mockResolvedValue({ data: [], error: null });
        chain.insert = insertMock;
        return chain;
      }
      if (table === 'admin_users') {
        const chain = setupChain(null);
        chain.eq.mockResolvedValue({
          data: [{ user_id: 'user-1' }, { user_id: 'user-2' }] as unknown[],
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

    mockAuth.admin.getUserById
      .mockResolvedValueOnce({ data: { user: { email: 'admin1@test.com' } } })
      .mockResolvedValueOnce({ data: { user: { email: 'admin2@test.com' } } });
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

    mockFrom.mockImplementation((table: string) => {
      if (table === 'ingredients') {
        const chain = setupChain(null);
        chain.or.mockResolvedValue({ data: lowStockItems, error: null });
        return chain;
      }
      if (table === 'stock_alert_notifications') {
        const chain = setupChain(null);
        chain.gte.mockResolvedValue({ data: [], error: null });
        chain.insert = insertMock;
        return chain;
      }
      if (table === 'admin_users') {
        const chain = setupChain(null);
        chain.eq.mockResolvedValue({ data: [{ user_id: 'user-1' }], error: null });
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

    mockAuth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'admin@test.com' } },
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
