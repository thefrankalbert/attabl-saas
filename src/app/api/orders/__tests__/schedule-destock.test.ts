/**
 * scheduleDestock is the single stock-deduction path for both order channels.
 *
 * What these tests pin down:
 *  - the work is handed to after(), NOT fired as a bare promise. On Vercel the
 *    function can freeze as soon as the response is sent, so a bare promise can
 *    simply never run - and an offline replay of the same order returns early,
 *    so it would never get a second chance either.
 *  - when the deduction fails, the restaurant is TOLD. The dish goes out anyway;
 *    a log line and a Sentry event alert nobody in the dining room.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
// The REAL error class, not a stand-in: the shortage wording depends on the
// error destockOrder actually throws, and a mocked message proved nothing.
import { ServiceError } from '@/services/errors';

const afterCallbacks: (() => unknown)[] = [];
vi.mock('next/server', () => ({
  // Deferred on purpose: a mock that ran the callback inline could not tell
  // after() apart from a bare fire-and-forget promise.
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
  },
}));

const mockDestockOrder = vi.fn();
vi.mock('@/services/inventory.service', () => ({
  createInventoryService: vi.fn(() => ({ destockOrder: mockDestockOrder })),
}));

const mockCheckAndNotifyLowStock = vi.fn();
const mockNotifyDestockFailed = vi.fn();
vi.mock('@/services/notification.service', () => ({
  checkAndNotifyLowStock: (...args: unknown[]) => mockCheckAndNotifyLowStock(...args),
  notifyDestockFailed: (...args: unknown[]) => mockNotifyDestockFailed(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const supabase = {} as SupabaseClient;

async function runScheduled() {
  const pending = afterCallbacks.splice(0, afterCallbacks.length);
  for (const cb of pending) await cb();
}

beforeEach(() => {
  afterCallbacks.length = 0;
  vi.clearAllMocks();
  mockDestockOrder.mockResolvedValue(1);
  mockCheckAndNotifyLowStock.mockResolvedValue(undefined);
});

describe('scheduleDestock', () => {
  it('defers the deduction to after() instead of firing a bare promise', async () => {
    const { scheduleDestock } = await import('../schedule-destock');
    scheduleDestock(supabase, { orderId: 'order-1', tenantId: 'tenant-1', channel: 'convive' });

    // Nothing has run yet: the work is queued on the request's after() scope.
    expect(mockDestockOrder).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await runScheduled();

    expect(mockDestockOrder).toHaveBeenCalledWith('order-1', 'tenant-1', undefined);
    expect(mockCheckAndNotifyLowStock).toHaveBeenCalledWith('tenant-1');
  });

  it('forwards the acting operator for the anti-theft trail', async () => {
    const { scheduleDestock } = await import('../schedule-destock');
    scheduleDestock(supabase, {
      orderId: 'order-2',
      tenantId: 'tenant-1',
      createdBy: 'user-9',
      channel: 'pos',
    });
    await runScheduled();

    expect(mockDestockOrder).toHaveBeenCalledWith('order-2', 'tenant-1', 'user-9');
  });

  it('warns the restaurant, and says it is a shortage, on the error destockOrder really throws', async () => {
    // Exactly what src/services/inventory.service.ts throws when the RPC raises
    // INSUFFICIENT_STOCK: a CONFLICT ServiceError whose message is in French.
    // Reading the message instead of the code is why the shortage wording used
    // to be unreachable, so the error is reproduced here in full.
    mockDestockOrder.mockRejectedValue(
      new ServiceError('Stock insuffisant pour cette commande', 'CONFLICT', {
        message: 'INSUFFICIENT_STOCK',
      }),
    );

    const { scheduleDestock } = await import('../schedule-destock');
    scheduleDestock(supabase, { orderId: 'order-3', tenantId: 'tenant-1', channel: 'convive' });
    await runScheduled();

    expect(mockNotifyDestockFailed).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      orderId: 'order-3',
      outOfStock: true,
    });
  });

  it('warns without claiming a shortage when the cause is something else', async () => {
    mockDestockOrder.mockRejectedValue(
      new ServiceError('Erreur destockage commande', 'INTERNAL', { message: 'network down' }),
    );

    const { scheduleDestock } = await import('../schedule-destock');
    scheduleDestock(supabase, { orderId: 'order-5', tenantId: 'tenant-1', channel: 'pos' });
    await runScheduled();

    expect(mockNotifyDestockFailed).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      orderId: 'order-5',
      outOfStock: false,
    });
  });

  it('does not warn when the deduction succeeds', async () => {
    const { scheduleDestock } = await import('../schedule-destock');
    scheduleDestock(supabase, { orderId: 'order-4', tenantId: 'tenant-1', channel: 'convive' });
    await runScheduled();

    expect(mockNotifyDestockFailed).not.toHaveBeenCalled();
  });

  it('never claims the stock was not deducted when only the low-stock alert failed', async () => {
    // The deduction SUCCEEDED here; the alerting step is what threw. Telling the
    // restaurant its stock was not deducted would push the owner to "correct" a
    // figure that is already right.
    mockDestockOrder.mockResolvedValue(3);
    mockCheckAndNotifyLowStock.mockRejectedValue(new Error('Resend down'));

    const { scheduleDestock } = await import('../schedule-destock');
    scheduleDestock(supabase, { orderId: 'order-6', tenantId: 'tenant-1', channel: 'convive' });
    await runScheduled();

    expect(mockDestockOrder).toHaveBeenCalled();
    expect(mockNotifyDestockFailed).not.toHaveBeenCalled();
  });
});
