import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks - vi.hoisted ensures these are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockCheck,
  mockGetClientIp,
  mockVerifyOrigin,
  mockGetUser,
  mockGetTenant,
  mockGetHeader,
  mockFrom,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockCheck: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockVerifyOrigin: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetTenant: vi.fn(),
  mockGetHeader: vi.fn(),
  mockFrom: vi.fn(),
  mockLoggerError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  permissionLimiter: { check: mockCheck },
  getClientIp: mockGetClientIp,
}));

vi.mock('@/lib/csrf', () => ({
  verifyOrigin: mockVerifyOrigin,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
}));

vi.mock('@/lib/cache', () => ({
  getTenant: mockGetTenant,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve({ get: mockGetHeader })),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Import the route handlers AFTER mocks are set up
import { PUT, DELETE } from '@/app/api/permissions/route';
import { PERMISSION_CODES } from '@/types/permission.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const SLUG_TENANT_ID = 'tenant-A';
const OTHER_TENANT_ID = 'tenant-B';

// The route schema uses z.record(z.enum(PERMISSION_CODES), z.boolean()), which is
// exhaustive: every permission code must be present. Build a complete map.
const FULL_PERMISSIONS: Record<string, boolean> = Object.fromEntries(
  PERMISSION_CODES.map((code) => [code, false]),
);

function buildPutRequest(): Request {
  return new Request('http://localhost/api/permissions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'manager',
      permissions: { ...FULL_PERMISSIONS, 'orders.view': true },
    }),
  });
}

function buildDeleteRequest(): Request {
  return new Request('http://localhost/api/permissions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'manager' }),
  });
}

/**
 * Builds a chainable admin_users query stub for verifyOwner. `eqCalls` captures
 * every .eq(column, value) so tests can assert the tenant scoping, and
 * `ownerRow` is what .maybeSingle() resolves to.
 */
function buildAdminUsersChain(
  eqCalls: Array<[string, unknown]>,
  ownerRow: { id?: string; tenant_id: string; role: string } | null,
) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return chain;
    }),
    maybeSingle: vi.fn(() => Promise.resolve({ data: ownerRow })),
  };
  return chain;
}

/**
 * Builds a role_permissions stub for the happy-path write. upsert resolves
 * directly; delete().eq().eq() returns a thenable so the final await yields
 * { error: null } regardless of how many .eq() calls are chained.
 */
function buildRolePermissionsChain() {
  const deleteChain = {
    eq: vi.fn(() => deleteChain),
    then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
  };
  const chain = {
    upsert: vi.fn(() => Promise.resolve({ error: null })),
    delete: vi.fn(() => deleteChain),
  };
  return { chain, deleteChain };
}

function setupAllowed(): void {
  mockVerifyOrigin.mockReturnValue(null);
  mockCheck.mockResolvedValue({ success: true });
  mockGetClientIp.mockReturnValue('127.0.0.1');
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('permissions API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Missing x-tenant-slug -> 400
  it('PUT returns 400 when x-tenant-slug header is absent', async () => {
    setupAllowed();
    mockGetHeader.mockReturnValue(null);

    const res = await PUT(buildPutRequest());

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Tenant introuvable');
    expect(mockGetTenant).not.toHaveBeenCalled();
  });

  it('DELETE returns 400 when x-tenant-slug header is absent', async () => {
    setupAllowed();
    mockGetHeader.mockReturnValue(null);

    const res = await DELETE(buildDeleteRequest());

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Tenant introuvable');
  });

  // 2. Tenant resolved but caller is not an active owner of it -> 403
  it('PUT returns 403 when caller is not an active owner of the resolved tenant', async () => {
    setupAllowed();
    mockGetHeader.mockReturnValue('restaurant-a');
    mockGetTenant.mockResolvedValue({ id: SLUG_TENANT_ID });

    const eqCalls: Array<[string, unknown]> = [];
    mockFrom.mockReturnValue(buildAdminUsersChain(eqCalls, null));

    const res = await PUT(buildPutRequest());

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Accès refusé');
    // The ownership lookup must be scoped to the resolved tenant id.
    expect(eqCalls).toContainEqual(['tenant_id', SLUG_TENANT_ID]);
    expect(eqCalls).toContainEqual(['user_id', USER_ID]);
    expect(eqCalls).toContainEqual(['role', 'owner']);
    expect(eqCalls).toContainEqual(['is_active', true]);
  });

  // 3. Owner of a DIFFERENT tenant than the resolved slug -> 403.
  // The query is filtered by .eq('tenant_id', SLUG_TENANT_ID), so an owner row
  // that only exists for OTHER_TENANT_ID yields no match -> maybeSingle null.
  it('DELETE returns 403 for an owner of a different tenant (cross-tenant scoping)', async () => {
    setupAllowed();
    mockGetHeader.mockReturnValue('restaurant-a');
    mockGetTenant.mockResolvedValue({ id: SLUG_TENANT_ID });

    const eqCalls: Array<[string, unknown]> = [];
    // Caller owns OTHER_TENANT_ID, but the scoped query targets SLUG_TENANT_ID.
    mockFrom.mockReturnValue(buildAdminUsersChain(eqCalls, null));

    const res = await DELETE(buildDeleteRequest());

    expect(res.status).toBe(403);
    expect(eqCalls).toContainEqual(['tenant_id', SLUG_TENANT_ID]);
    expect(eqCalls).not.toContainEqual(['tenant_id', OTHER_TENANT_ID]);
  });

  // 4. Happy path - owner of the resolved tenant proceeds (PUT upsert).
  it('PUT proceeds for the active owner of the resolved tenant', async () => {
    setupAllowed();
    mockGetHeader.mockReturnValue('restaurant-a');
    mockGetTenant.mockResolvedValue({ id: SLUG_TENANT_ID });

    const eqCalls: Array<[string, unknown]> = [];
    const adminUsersChain = buildAdminUsersChain(eqCalls, {
      id: 'membership-A',
      tenant_id: SLUG_TENANT_ID,
      role: 'owner',
    });
    const { chain: rolePermissionsChain } = buildRolePermissionsChain();
    mockFrom.mockImplementation((table: string) =>
      table === 'admin_users' ? adminUsersChain : rolePermissionsChain,
    );

    const res = await PUT(buildPutRequest());

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
    expect(eqCalls).toContainEqual(['tenant_id', SLUG_TENANT_ID]);
    expect(rolePermissionsChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: SLUG_TENANT_ID, role: 'manager' }),
      expect.objectContaining({ onConflict: 'tenant_id,role' }),
    );
  });

  // 4b. Regression guard: updated_by must be the actor's admin_users.id (the
  // membership PK), NEVER the auth user id. role_permissions.updated_by is a FK
  // to admin_users(id); writing user.id (== admin_users.user_id) caused FK
  // violations / wrong-actor records - the same ID-space bug fixed in invitations.
  it('PUT writes updated_by as the actor admin_users.id, never the auth user id', async () => {
    setupAllowed();
    mockGetHeader.mockReturnValue('restaurant-a');
    mockGetTenant.mockResolvedValue({ id: SLUG_TENANT_ID });

    const eqCalls: Array<[string, unknown]> = [];
    const adminUsersChain = buildAdminUsersChain(eqCalls, {
      id: 'membership-A',
      tenant_id: SLUG_TENANT_ID,
      role: 'owner',
    });
    const { chain: rolePermissionsChain } = buildRolePermissionsChain();
    mockFrom.mockImplementation((table: string) =>
      table === 'admin_users' ? adminUsersChain : rolePermissionsChain,
    );

    const res = await PUT(buildPutRequest());

    expect(res.status).toBe(200);
    expect(rolePermissionsChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ updated_by: 'membership-A' }),
      expect.anything(),
    );
    expect(rolePermissionsChain.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ updated_by: USER_ID }),
      expect.anything(),
    );
  });

  // 5. Happy path - owner of the resolved tenant proceeds (DELETE).
  it('DELETE proceeds for the active owner of the resolved tenant', async () => {
    setupAllowed();
    mockGetHeader.mockReturnValue('restaurant-a');
    mockGetTenant.mockResolvedValue({ id: SLUG_TENANT_ID });

    const eqCalls: Array<[string, unknown]> = [];
    const adminUsersChain = buildAdminUsersChain(eqCalls, {
      tenant_id: SLUG_TENANT_ID,
      role: 'owner',
    });
    const { chain: rolePermissionsChain, deleteChain } = buildRolePermissionsChain();
    mockFrom.mockImplementation((table: string) =>
      table === 'admin_users' ? adminUsersChain : rolePermissionsChain,
    );

    const res = await DELETE(buildDeleteRequest());

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
    expect(eqCalls).toContainEqual(['tenant_id', SLUG_TENANT_ID]);
    expect(rolePermissionsChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq).toHaveBeenCalledWith('tenant_id', SLUG_TENANT_ID);
  });
});
