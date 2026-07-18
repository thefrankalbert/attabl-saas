import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderMutationSchema } from '@/lib/validations/order-mutation.schema';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const mockRateLimitCheck = vi.fn<() => Promise<{ success: boolean }>>();
vi.mock('@/lib/rate-limit', () => ({
  assignmentLimiter: { check: () => mockRateLimitCheck() },
  getClientIp: () => '127.0.0.1',
}));

vi.mock('@/lib/csrf', () => ({ verifyOrigin: () => null }));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Map([['x-tenant-slug', 'demo']])),
}));

const mockActionStatus = vi.fn();
const mockActionAssign = vi.fn();
const mockActionRelease = vi.fn();
vi.mock('@/app/actions/orders', () => ({
  actionUpdateOrderStatus: (...a: unknown[]) => mockActionStatus(...a),
}));
vi.mock('@/app/actions/assignments', () => ({
  actionAssignServer: (...a: unknown[]) => mockActionAssign(...a),
  actionReleaseAssignment: (...a: unknown[]) => mockActionRelease(...a),
}));

// Configurable idempotency outcomes for each test.
let insertResult: { error: { code: string } | null } = { error: null };
// processed_at of the existing claim row returned on a 23505 duplicate.
let existingProcessedAt: string | null = null;
const mockInsert = vi.fn(() => Promise.resolve(insertResult));
const mockDeleteEq = vi.fn(() => Promise.resolve({ error: null }));
const mockUpdateEq = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
      from: (table: string) => {
        if (table === 'tenants') {
          return {
            select: () => ({
              eq: () => ({ is: () => ({ single: () => Promise.resolve({ data: { id: 't1' } }) }) }),
            }),
          };
        }
        if (table === 'admin_users') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'a1' } }) }),
                }),
              }),
            }),
          };
        }
        // order_mutation_requests
        return {
          insert: mockInsert,
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { processed_at: existingProcessedAt } }),
            }),
          }),
          delete: () => ({ eq: mockDeleteEq }),
          update: () => ({ eq: mockUpdateEq }),
        };
      },
    }),
}));

function post(body: unknown): Request {
  return new Request('https://demo.attabl.com/api/orders/mutations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('orderMutationSchema', () => {
  const rid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const oid = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

  it('accepts a valid status mutation', () => {
    expect(
      orderMutationSchema.safeParse({
        type: 'status',
        client_request_id: rid,
        orderId: oid,
        status: 'delivered',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(orderMutationSchema.safeParse({ type: 'nope', client_request_id: rid }).success).toBe(
      false,
    );
  });

  it('rejects a non-uuid client_request_id', () => {
    expect(
      orderMutationSchema.safeParse({
        type: 'release',
        client_request_id: 'not-a-uuid',
        assignmentId: oid,
      }).success,
    ).toBe(false);
  });
});

describe('POST /api/orders/mutations (idempotency)', () => {
  const rid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const oid = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimitCheck.mockResolvedValue({ success: true });
    insertResult = { error: null };
    existingProcessedAt = null;
  });

  it('runs the action once on a fresh request', async () => {
    mockActionStatus.mockResolvedValue({ success: true });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    expect(res.status).toBe(200);
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockActionStatus).toHaveBeenCalledWith('t1', oid, 'delivered');
  });

  it('dedupes a replayed request as success only when the first attempt COMPLETED', async () => {
    insertResult = { error: { code: '23505' } }; // unique_violation
    existingProcessedAt = '2026-07-18T10:00:00Z'; // first attempt finished
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deduped).toBe(true);
    expect(mockActionStatus).not.toHaveBeenCalled();
  });

  it('answers 409 (retryable) while a concurrent claim is still in flight', async () => {
    insertResult = { error: { code: '23505' } };
    existingProcessedAt = null; // first attempt still running (or crashed)
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    expect(res.status).toBe(409);
    expect(mockActionStatus).not.toHaveBeenCalled();
  });

  it('marks the claim processed on success', async () => {
    mockActionStatus.mockResolvedValue({ success: true });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateEq).toHaveBeenCalled();
  });

  it('releases the idempotency key when the action is rejected (422 business)', async () => {
    mockActionStatus.mockResolvedValue({ error: 'Statut invalide' });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'bogus' }),
    );
    expect(res.status).toBe(422);
    expect(mockDeleteEq).toHaveBeenCalled();
  });

  it('maps the internal-error sentinel to 500 so the outbox retries it', async () => {
    mockActionStatus.mockResolvedValue({ error: 'Erreur interne' });
    const { POST } = await import('@/app/api/orders/mutations/route');
    const res = await POST(
      post({ type: 'status', client_request_id: rid, orderId: oid, status: 'delivered' }),
    );
    expect(res.status).toBe(500);
    expect(mockDeleteEq).toHaveBeenCalled();
  });
});
