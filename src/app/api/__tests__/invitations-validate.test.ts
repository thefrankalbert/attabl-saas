import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  invitationValidateLimiter: { check: vi.fn() },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@/services/invitation.service', () => ({
  createInvitationService: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { GET } from '../invitations/validate/route';
import { invitationValidateLimiter } from '@/lib/rate-limit';
import { createInvitationService } from '@/services/invitation.service';
import { ServiceError } from '@/services/errors';

const VALID_TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

function buildRequest(token: string | null): Request {
  const url = token
    ? `http://localhost:3000/api/invitations/validate?token=${token}`
    : 'http://localhost:3000/api/invitations/validate';
  return new Request(url, { method: 'GET' });
}

function allowRateLimit(allowed: boolean) {
  vi.mocked(invitationValidateLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 30,
    remaining: allowed ? 29 : 0,
    reset: Date.now() + 600_000,
  });
}

function mockValidateToken(impl: () => Promise<unknown>) {
  vi.mocked(createInvitationService).mockReturnValue({
    validateToken: vi.fn().mockImplementation(impl),
  } as unknown as ReturnType<typeof createInvitationService>);
}

describe('GET /api/invitations/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowRateLimit(true);
  });

  it('returns 200 { valid: true } for a valid token', async () => {
    mockValidateToken(() => Promise.resolve({ id: 'inv-1', tenant_id: 't-1' }));
    const res = await GET(buildRequest(VALID_TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ valid: true });
  });

  it('returns 404 { valid: false } when the token is unknown', async () => {
    mockValidateToken(() => Promise.reject(new ServiceError('Introuvable', 'NOT_FOUND')));
    const res = await GET(buildRequest(VALID_TOKEN));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ valid: false });
  });

  it('returns 410 { valid: false, expired: true } when the token expired', async () => {
    mockValidateToken(() => Promise.reject(new ServiceError('Expire', 'VALIDATION')));
    const res = await GET(buildRequest(VALID_TOKEN));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ valid: false, expired: true });
  });

  it('returns 400 for a malformed token without touching the service', async () => {
    const res = await GET(buildRequest('not-a-token'));
    expect(res.status).toBe(400);
    expect(createInvitationService).not.toHaveBeenCalled();
  });

  it('returns 429 when the validate limiter trips', async () => {
    allowRateLimit(false);
    const res = await GET(buildRequest(VALID_TOKEN));
    expect(res.status).toBe(429);
    expect(createInvitationService).not.toHaveBeenCalled();
  });

  it('keys the limiter by token, not IP', async () => {
    mockValidateToken(() => Promise.resolve({ id: 'inv-1' }));
    await GET(buildRequest(VALID_TOKEN));
    expect(invitationValidateLimiter.check).toHaveBeenCalledWith(VALID_TOKEN);
  });
});
