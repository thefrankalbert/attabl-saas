import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  invitationLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/invitation.service', () => ({
  createInvitationService: vi.fn(),
}));

vi.mock('@/services/email.service', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: vi.fn(),
}));

vi.mock('@/lib/cache-headers', () => ({
  jsonWithCache: vi.fn().mockImplementation((data: unknown) => Response.json(data)),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { GET, POST } from '../invitations/route';
import { DELETE } from '../invitations/[id]/route';
import { POST as RESEND_POST } from '../invitations/[id]/resend/route';
import { invitationLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createInvitationService } from '@/services/invitation.service';
import { createPlanEnforcementService } from '@/services/plan-enforcement.service';
import { ServiceError } from '@/services/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGetRequest(): Request {
  return new Request('http://localhost:3000/api/invitations', { method: 'GET' });
}

function buildPostRequest(body?: unknown): Request {
  return new Request('http://localhost:3000/api/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildDeleteRequest(): Request {
  return new Request('http://localhost:3000/api/invitations/inv-1', { method: 'DELETE' });
}

function buildResendRequest(): Request {
  return new Request('http://localhost:3000/api/invitations/inv-1/resend', { method: 'POST' });
}

function buildParams(id = 'inv-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function mockRateLimit(allowed: boolean) {
  vi.mocked(invitationLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 5,
    remaining: allowed ? 4 : 0,
    reset: Date.now() + 600_000,
  });
}

function createMockSupabase(overrides?: {
  authUser?: { id: string; email: string } | null;
  adminUser?: { tenant_id: string; role: string } | null;
}) {
  const user = overrides?.authUser ?? { id: 'user-1', email: 'admin@test.com' };
  const adminUser = overrides?.adminUser ?? { tenant_id: 'tenant-1', role: 'owner' };

  const result = { data: adminUser, error: adminUser ? null : { message: 'Not found' } };
  const chain = (): Record<string, ReturnType<typeof vi.fn>> => {
    const c: Record<string, ReturnType<typeof vi.fn>> = {};
    c.single = vi.fn().mockResolvedValue(result);
    c.eq = vi.fn().mockImplementation(() => c);
    c.in = vi.fn().mockImplementation(() => c);
    c.neq = vi.fn().mockImplementation(() => c);
    return c;
  };
  const adminSelect = vi.fn().mockImplementation(() => chain());

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({ select: adminSelect }),
  };
}

function createMockDeleteSupabase(overrides?: {
  authUser?: { id: string } | null;
  adminUser?: { role: string } | null;
}) {
  const user = overrides?.authUser ?? { id: 'user-1' };
  const adminUser = overrides?.adminUser ?? { role: 'owner' };

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
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'admin_users') return makeSingleChain(adminUser);
      return makeSingleChain(null);
    }),
  };
}

function setupMockAdminClient(overrides?: {
  invitations?: Array<Record<string, unknown>>;
  invitation?: Record<string, unknown>;
  tenant?: Record<string, unknown>;
}) {
  const invitations = overrides?.invitations ?? [
    { id: 'inv-1', email: 'new@test.com', role: 'admin', status: 'pending', token: 'secret' },
  ];
  const invitation = overrides?.invitation ?? {
    id: 'inv-1',
    email: 'new@test.com',
    role: 'admin',
    status: 'pending',
    token: 'secret',
    tenant_id: 'tenant-1',
  };
  const tenant = overrides?.tenant ?? { name: 'Test Restaurant', logo_url: null, slug: 'test' };

  const inviteSingle = vi.fn().mockResolvedValue({ data: { tenant_id: 'tenant-1' }, error: null });
  const inviteEq = vi.fn().mockReturnValue({ single: inviteSingle });
  const inviteSelect = vi.fn().mockReturnValue({ eq: inviteEq });

  const tenantSingle = vi.fn().mockResolvedValue({ data: tenant, error: null });
  const tenantEq = vi.fn().mockReturnValue({ single: tenantSingle });
  const tenantSelect = vi.fn().mockReturnValue({ eq: tenantEq });

  let fromCallCount = 0;
  const adminClient = {
    from: vi.fn().mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount <= 1) return { select: inviteSelect };
      return { select: tenantSelect };
    }),
  };

  vi.mocked(createAdminClient).mockReturnValue(adminClient as never);
  vi.mocked(createInvitationService).mockReturnValue({
    getPendingInvitations: vi.fn().mockResolvedValue(invitations),
    createInvitation: vi.fn().mockResolvedValue(invitation),
    cancelInvitation: vi.fn().mockResolvedValue(undefined),
    resendInvitation: vi.fn().mockResolvedValue(invitation),
  } as never);
  vi.mocked(createPlanEnforcementService).mockReturnValue({
    canAddAdmin: vi.fn().mockResolvedValue(undefined),
  } as never);

  return adminClient;
}

// ---------------------------------------------------------------------------
// Tests: GET /api/invitations
// ---------------------------------------------------------------------------

describe('GET /api/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await GET(buildGetRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ authUser: null });
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await GET(buildGetRequest());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non autorise');
  });

  it('returns invitations with token stripped', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();

    const res = await GET(buildGetRequest());
    const json = (await res.json()) as { invitations: Array<Record<string, unknown>> };

    expect(res.status).toBe(200);
    expect(json.invitations).toHaveLength(1);
    expect(json.invitations[0]).not.toHaveProperty('token');
    expect(json.invitations[0]).toHaveProperty('email', 'new@test.com');
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/invitations
// ---------------------------------------------------------------------------

describe('POST /api/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await POST(buildPostRequest({ email: 'new@test.com', role: 'admin' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ authUser: null });
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildPostRequest({ email: 'new@test.com', role: 'admin' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non autorise');
  });

  it('returns 400 when body is invalid', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildPostRequest({ email: 'not-an-email' }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(json.error).toContain('invalide');
  });

  it('returns 201 when invitation is created', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();

    const res = await POST(buildPostRequest({ email: 'new@test.com', role: 'admin' }));
    const json = (await res.json()) as { success: boolean; invitation: Record<string, unknown> };

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.invitation).not.toHaveProperty('token');
  });
});

// ---------------------------------------------------------------------------
// Tests: DELETE /api/invitations/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/invitations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await DELETE(buildDeleteRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    const mock = createMockDeleteSupabase({ authUser: null });
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await DELETE(buildDeleteRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non autorise');
  });

  it('returns success when invitation is cancelled', async () => {
    mockRateLimit(true);
    const mock = createMockDeleteSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();

    const res = await DELETE(buildDeleteRequest(), buildParams());
    const json = (await res.json()) as { success: boolean };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('returns mapped status on ServiceError', async () => {
    mockRateLimit(true);
    const mock = createMockDeleteSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();
    // Override the service to throw
    vi.mocked(createInvitationService).mockReturnValue({
      cancelInvitation: vi.fn().mockRejectedValue(new ServiceError('Introuvable', 'NOT_FOUND')),
    } as never);

    const res = await DELETE(buildDeleteRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(json.error).toBe('Introuvable');
  });
});

// ---------------------------------------------------------------------------
// Tests: POST /api/invitations/[id]/resend
// ---------------------------------------------------------------------------

describe('POST /api/invitations/[id]/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit(false);

    const res = await RESEND_POST(buildResendRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    const mock = createMockDeleteSupabase({ authUser: null });
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await RESEND_POST(buildResendRequest(), buildParams());
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(json.error).toContain('Non autorise');
  });

  it('returns success when invitation is resent', async () => {
    mockRateLimit(true);
    const mock = createMockDeleteSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();

    const res = await RESEND_POST(buildResendRequest(), buildParams());
    const json = (await res.json()) as { success: boolean; invitation: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.invitation).not.toHaveProperty('token');
  });
});
