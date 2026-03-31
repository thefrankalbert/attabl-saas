import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  assignmentLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/assignment.service', () => ({
  createAssignmentService: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { DELETE } from '../assignments/[id]/route';
import { assignmentLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { createAssignmentService } from '@/services/assignment.service';
import { ServiceError } from '@/services/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(): Request {
  return new Request('http://localhost:3000/api/assignments/assign-1', { method: 'DELETE' });
}

function buildParams(id = 'assign-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(assignmentLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 30,
    remaining: allowed ? 29 : 0,
    reset: Date.now() + 60_000,
  });
}

function createMockSupabase(overrides?: {
  authUser?: { id: string } | null;
  tenant?: { id: string } | null;
  adminUser?: { role: string } | null;
}) {
  const user = overrides?.authUser ?? { id: 'user-1' };
  const tenant = overrides?.tenant ?? { id: 'tenant-1' };
  const adminUser = overrides?.adminUser ?? { role: 'admin' };

  const makeSingleChain = (data: unknown) => {
    const result = { data, error: data ? null : { message: 'Not found' } };
    const chain = (): Record<string, ReturnType<typeof vi.fn>> => {
      const c: Record<string, ReturnType<typeof vi.fn>> = {};
      c.single = vi.fn().mockResolvedValue(result);
      c.eq = vi.fn().mockImplementation(() => c);
      c.in = vi.fn().mockImplementation(() => c);
      c.neq = vi.fn().mockImplementation(() => c);
      return c;
    };
    return { select: vi.fn().mockImplementation(() => chain()) };
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tenants') return makeSingleChain(tenant);
      if (table === 'admin_users') return makeSingleChain(adminUser);
      return makeSingleChain(null);
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /api/assignments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(
      new Headers({ 'x-tenant-slug': 'my-restaurant' }) as never,
    );
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await DELETE(buildRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ authUser: null });
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await DELETE(buildRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non authentifi');
  });

  it('returns 400 when x-tenant-slug header is missing', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(headers).mockResolvedValue(new Headers() as never);

    const res = await DELETE(buildRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('Tenant non identifi');
  });

  it('returns success when assignment is released', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(createAssignmentService).mockReturnValue({
      releaseAssignment: vi.fn().mockResolvedValue(undefined),
    } as never);

    const res = await DELETE(buildRequest(), buildParams());
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns mapped status when ServiceError is thrown', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    vi.mocked(createAssignmentService).mockReturnValue({
      releaseAssignment: vi.fn().mockRejectedValue(new ServiceError('Not found', 'NOT_FOUND')),
    } as never);

    const res = await DELETE(buildRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toBe('Not found');
  });
});
