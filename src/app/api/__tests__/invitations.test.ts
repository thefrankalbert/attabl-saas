import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, ses refus sont testes
// dans tenant-lock-routes.test.ts.
vi.mock('@/lib/billing/tenant-lock-response', () => ({
  tenantLockResponse: vi.fn(async () => null),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/rate-limit', () => ({
  invitationManageLimiter: { check: vi.fn() },
  invitationTenantDailyLimiter: { check: vi.fn() },
  invitationValidateLimiter: { check: vi.fn() },
  invitationAcceptLimiter: { check: vi.fn() },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockImplementation(async () => (key: string) => key),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/invitation.service', () => ({
  createInvitationService: vi.fn(),
}));

// Journal d'audit: l'ecriture elle-meme est testee dans audit.service; ici on
// verifie QUI et QUOI la route lui transmet.
const { mockAuditLog, mockCreateAuditService } = vi.hoisted(() => {
  const log = vi.fn().mockResolvedValue(undefined);
  return { mockAuditLog: log, mockCreateAuditService: vi.fn(() => ({ log })) };
});
vi.mock('@/services/audit.service', () => ({
  createAuditService: mockCreateAuditService,
}));

vi.mock('@/services/email.service', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));

// isAdminSeat reste la VRAIE regle (delegation), enveloppee d'un espion pour
// prouver l'aiguillage canAddAdmin / canAddStaff.
vi.mock('@/services/plan-enforcement.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/plan-enforcement.service')>();
  return {
    ...original,
    createPlanEnforcementService: vi.fn(),
    isAdminSeat: vi.fn(original.isAdminSeat),
  };
});

vi.mock('@/lib/cache-headers', () => ({
  jsonWithCache: vi.fn().mockImplementation((data: unknown) => Response.json(data)),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({
    get: (key: string) => (key === 'x-tenant-slug' ? 'test' : null),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { GET, POST } from '../invitations/route';
import { DELETE } from '../invitations/[id]/route';
import { POST as RESEND_POST } from '../invitations/[id]/resend/route';
import { invitationManageLimiter, invitationTenantDailyLimiter } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createInvitationService } from '@/services/invitation.service';
import { createPlanEnforcementService, isAdminSeat } from '@/services/plan-enforcement.service';
import { ServiceError } from '@/services/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_INVITATION_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

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
  return new Request(`http://localhost:3000/api/invitations/${TEST_INVITATION_ID}`, {
    method: 'DELETE',
  });
}

function buildResendRequest(): Request {
  return new Request(`http://localhost:3000/api/invitations/${TEST_INVITATION_ID}/resend`, {
    method: 'POST',
  });
}

function buildParams(id = TEST_INVITATION_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  mockDailyQuota(true);
});

function mockRateLimit(allowed: boolean) {
  vi.mocked(invitationManageLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 30,
    remaining: allowed ? 29 : 0,
    reset: Date.now() + 600_000,
  });
}

function mockDailyQuota(allowed: boolean) {
  vi.mocked(invitationTenantDailyLimiter.check).mockResolvedValue({
    success: allowed,
    limit: 30,
    remaining: allowed ? 29 : 0,
    reset: Date.now() + 86_400_000,
  });
}

type ActorRow = {
  id?: string;
  postes: string[];
  permission_overrides?: Record<string, boolean> | null;
} | null;

const OWNER: ActorRow = { id: 'membership-1', postes: ['owner'] };
const MANAGER: ActorRow = { id: 'membership-mgr', postes: ['manager'] };

/**
 * Client de SESSION simule. Les routes passent par le VRAI resolveLiveMember :
 * la ligne `admin_users` de l'appelant (postes, permission_overrides) est lue
 * ici, et les reglages du restaurant (`poste_permissions`) sont vides.
 */
function createMockSupabase(overrides?: {
  authUser?: { id: string; email: string } | null;
  actor?: ActorRow;
}) {
  const user = overrides?.authUser ?? { id: 'user-1', email: 'admin@test.com' };
  const actor = overrides?.actor === undefined ? OWNER : overrides.actor;

  const makeChain = (data: unknown): Record<string, ReturnType<typeof vi.fn>> => {
    const result = { data, error: data ? null : { message: 'Not found' } };
    const c: Record<string, ReturnType<typeof vi.fn>> = {};
    c.single = vi.fn().mockResolvedValue(result);
    c.maybeSingle = vi.fn().mockResolvedValue(result);
    c.eq = vi.fn().mockImplementation(() => c);
    c.neq = vi.fn().mockImplementation(() => c);
    c.is = vi.fn().mockImplementation(() => c);
    return c;
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'tenants') {
        return { select: vi.fn().mockImplementation(() => makeChain({ id: 'tenant-1' })) };
      }
      if (table === 'poste_permissions') {
        const c = makeChain(null);
        c.in = vi.fn().mockResolvedValue({ data: [], error: null });
        return { select: vi.fn().mockImplementation(() => c) };
      }
      // admin_users: ligne de membre vivant de l'appelant (id = cle de membre,
      // jamais l'id du compte auth, pour la cle etrangere invited_by).
      const row = actor
        ? {
            id: actor.id ?? 'membership-1',
            postes: actor.postes,
            permission_overrides: actor.permission_overrides ?? null,
            is_super_admin: false,
            role: 'staff',
          }
        : null;
      return { select: vi.fn().mockImplementation(() => makeChain(row)) };
    }),
  };
}

/** Meme client de session: DELETE et renvoi lisent la meme ligne de membre. */
const createMockDeleteSupabase = createMockSupabase;

function setupMockAdminClient(overrides?: {
  invitations?: Array<Record<string, unknown>>;
  invitation?: Record<string, unknown>;
  tenant?: Record<string, unknown>;
  /** Ce que l'invitation lue en base donnerait (annuler / renvoyer). */
  rights?: { postes: string[]; permission_overrides?: Record<string, boolean> | null };
}) {
  const invitations = overrides?.invitations ?? [
    {
      id: TEST_INVITATION_ID,
      email: 'new@test.com',
      postes: ['waiter'],
      status: 'pending',
      token: 'secret',
    },
  ];
  const invitation = overrides?.invitation ?? {
    id: TEST_INVITATION_ID,
    email: 'new@test.com',
    postes: ['waiter'],
    status: 'pending',
    token: 'secret',
    tenant_id: 'tenant-1',
  };
  const tenant = overrides?.tenant ?? { name: 'Test Restaurant', logo_url: null, slug: 'test' };
  const rights = {
    tenant_id: 'tenant-1',
    postes: overrides?.rights?.postes ?? ['waiter'],
    permission_overrides: overrides?.rights?.permission_overrides ?? null,
  };

  const single = (data: unknown) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data, error: null }) }),
    }),
  });
  // Reglages du restaurant (poste_permissions), lus par le client admin: aucun.
  const posteSettings = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    }),
  };

  const adminClient = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'invitations') return single(rights);
      if (table === 'poste_permissions') return posteSettings;
      return single(tenant);
    }),
  };

  vi.mocked(createAdminClient).mockReturnValue(adminClient as never);
  const createInvitation = vi.fn().mockResolvedValue(invitation);
  vi.mocked(createInvitationService).mockReturnValue({
    getPendingInvitations: vi.fn().mockResolvedValue({ invitations, total: invitations.length }),
    assertNotAlreadyMember: vi.fn().mockResolvedValue(undefined),
    createInvitation,
    cancelInvitation: vi.fn().mockResolvedValue(undefined),
    resendInvitation: vi.fn().mockResolvedValue(invitation),
  } as never);
  vi.mocked(createPlanEnforcementService).mockReturnValue({
    canAddAdmin: vi.fn().mockResolvedValue(undefined),
    canAddStaff: vi.fn().mockResolvedValue(undefined),
  } as never);

  return Object.assign(adminClient, { createInvitation });
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

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toContain('Trop de requ');
  });

  it('returns 401 when user is not authenticated', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase({ authUser: null });
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));
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

  it('B3: un corps qui n est pas du JSON repond 400, pas 500', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);

    const res = await POST(
      new Request('http://localhost:3000/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'pas du json{',
      }),
    );

    expect(res.status).toBe(400);
  });

  it('names the email field in the error when the address is invalid', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase() as never);

    const res = await POST(buildPostRequest({ email: 'not-an-email', postes: ['waiter'] }));
    const json = (await res.json()) as { error: string };

    expect(json.error).toBe('Adresse email invalide');
  });

  it('returns 201 when invitation is created', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));
    const json = (await res.json()) as { success: boolean; invitation: Record<string, unknown> };

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.invitation).not.toHaveProperty('token');
  });

  // P-10: plafond quotidien d'invitations par restaurant (relais d'hameconnage).
  it('P-10: refuse avec 429 (Retry-After tire du limiteur), sans creer ni envoyer, au plafond quotidien', async () => {
    mockRateLimit(true);
    vi.mocked(invitationTenantDailyLimiter.check).mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 7_200_000,
    });
    vi.mocked(createClient).mockResolvedValue(createMockSupabase() as never);
    setupMockAdminClient();

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));
    const json = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(json.error).toBe('invitationDailyLimit');
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(7000);
    expect(invitationTenantDailyLimiter.check).toHaveBeenCalledWith('tenant-1');
    const service = vi.mocked(createInvitationService).mock.results[0].value as {
      createInvitation: ReturnType<typeof vi.fn>;
    };
    expect(service.createInvitation).not.toHaveBeenCalled();
  });

  it('P-10: un doublon refuse ne consomme pas le quota quotidien', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase() as never);
    setupMockAdminClient();
    const service = vi.mocked(createInvitationService).mock.results[0]?.value;
    expect(service).toBeUndefined();
    vi.mocked(createInvitationService).mockReturnValue({
      assertNotAlreadyMember: vi
        .fn()
        .mockRejectedValue(new ServiceError('Deja membre', 'VALIDATION')),
      createInvitation: vi.fn(),
    } as never);
    vi.mocked(invitationTenantDailyLimiter.check).mockClear();

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));

    expect(res.status).toBe(400);
    expect(invitationTenantDailyLimiter.check).not.toHaveBeenCalled();
  });

  it('enforces the staff limit (canAddStaff) for a staff role', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();
    const canAddAdmin = vi.fn().mockResolvedValue(undefined);
    const canAddStaff = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createPlanEnforcementService).mockReturnValue({ canAddAdmin, canAddStaff } as never);

    const res = await POST(buildPostRequest({ email: 'cook@test.com', postes: ['chef'] }));

    expect(res.status).toBe(201);
    expect(canAddStaff).toHaveBeenCalledTimes(1);
    expect(canAddAdmin).not.toHaveBeenCalled();
  });

  // Decision du proprietaire du 2026-11-21: au-dela de la limite du plan,
  // l'invitation est refusee cote serveur, avec un code dedie qui fait
  // afficher le bandeau "plan superieur" sur l'ecran Equipe.
  it('refuse une invitation au-dela de la limite avec le code PLAN_LIMIT, sans rien creer', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();
    const createInvitation = vi.fn();
    vi.mocked(createInvitationService).mockReturnValue({
      getPendingInvitations: vi.fn(),
      assertNotAlreadyMember: vi.fn().mockResolvedValue(undefined),
      createInvitation,
      cancelInvitation: vi.fn(),
      resendInvitation: vi.fn(),
    } as never);
    const canAddStaff = vi
      .fn()
      .mockRejectedValue(
        new ServiceError("Limite atteinte : 3 membre(s) d'equipe maximum.", 'VALIDATION'),
      );
    vi.mocked(createPlanEnforcementService).mockReturnValue({
      canAddAdmin: vi.fn(),
      canAddStaff,
    } as never);

    const res = await POST(buildPostRequest({ email: 'cook@test.com', postes: ['chef'] }));
    const body = (await res.json()) as { error: string; code?: string };

    expect(res.status).toBe(400);
    expect(body.code).toBe('PLAN_LIMIT');
    expect(body.error).toMatch(/Limite atteinte/);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  // B54: une adresse retiree de ce restaurant n'est pas reinvitable. La route
  // renvoie le code metier MEMBER_REMOVED (409) et ne cree rien.
  it('B54: adresse retiree -> 409 avec le code MEMBER_REMOVED, sans rien creer', async () => {
    mockRateLimit(true);
    const mock = createMockSupabase();
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();
    const createInvitation = vi.fn();
    vi.mocked(createInvitationService).mockReturnValue({
      getPendingInvitations: vi.fn(),
      assertNotAlreadyMember: vi.fn().mockRejectedValue(
        new ServiceError('Cette adresse a ete retiree de votre equipe.', 'CONFLICT', {
          reason: 'MEMBER_REMOVED',
        }),
      ),
      createInvitation,
      cancelInvitation: vi.fn(),
      resendInvitation: vi.fn(),
    } as never);

    const res = await POST(buildPostRequest({ email: 'awa@test.com', postes: ['waiter'] }));
    const body = (await res.json()) as { error: string; code?: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe('MEMBER_REMOVED');
    expect(body.error).toMatch(/retiree/);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it('passes the actor admin_users.id (membership PK) as invitedBy, never the auth user id', async () => {
    // Regression guard for the FK bug: invitations.invited_by references
    // admin_users(id), NOT auth.users(id). Passing user.id (== admin_users.user_id)
    // triggered invitations_invited_by_fkey violations for every owner.
    mockRateLimit(true);
    const mock = createMockSupabase({
      authUser: { id: 'auth-user-99', email: 'owner@test.com' },
      actor: { id: 'membership-42', postes: ['owner'] },
    });
    vi.mocked(createClient).mockResolvedValue(mock as never);
    setupMockAdminClient();

    const createInvitation = vi.fn().mockResolvedValue({
      id: TEST_INVITATION_ID,
      email: 'new@test.com',
      postes: ['waiter'],
      status: 'pending',
      token: 'secret',
      tenant_id: 'tenant-1',
    });
    vi.mocked(createInvitationService).mockReturnValue({
      getPendingInvitations: vi.fn(),
      assertNotAlreadyMember: vi.fn().mockResolvedValue(undefined),
      createInvitation,
      cancelInvitation: vi.fn(),
      resendInvitation: vi.fn(),
    } as never);

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));

    expect(res.status).toBe(201);
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ invitedBy: 'membership-42' }),
    );
    expect(createInvitation).not.toHaveBeenCalledWith(
      expect.objectContaining({ invitedBy: 'auth-user-99' }),
    );
  });

  it('un gerant invite pour un siege de personnel (canAddStaff, decision G.a), jamais canAddAdmin', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ actor: MANAGER }) as never);
    setupMockAdminClient();
    const canAddAdmin = vi.fn().mockResolvedValue(undefined);
    const canAddStaff = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createPlanEnforcementService).mockReturnValue({ canAddAdmin, canAddStaff } as never);

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));

    expect(res.status).toBe(201);
    expect(canAddStaff).toHaveBeenCalledTimes(1);
    expect(canAddAdmin).not.toHaveBeenCalled();
  });

  it('enforces the admin limit (canAddAdmin) quand la regle de siege (isAdminSeat) le dit', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase() as never);
    setupMockAdminClient();
    const canAddAdmin = vi.fn().mockResolvedValue(undefined);
    const canAddStaff = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createPlanEnforcementService).mockReturnValue({ canAddAdmin, canAddStaff } as never);
    // Reglage manager = siege d'administrateur (valeur 'admin' du choix G.a).
    vi.mocked(isAdminSeat).mockReturnValueOnce(true);

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['manager'] }));

    expect(res.status).toBe(201);
    expect(canAddAdmin).toHaveBeenCalledTimes(1);
    expect(canAddStaff).not.toHaveBeenCalled();
  });

  // Validation du corps: la conception interdit ces cinq cas, aucune ecriture.
  it.each([
    ['postes vide', { postes: [] }],
    ['poste owner', { postes: ['owner'] }],
    ['poste inconnu', { postes: ['admin'] }],
    ['doublon', { postes: ['waiter', 'waiter'] }],
    [
      'code de droit inconnu dans permission_overrides',
      {
        postes: ['waiter'],
        permission_overrides: { 'root.access': true },
      },
    ],
  ])('refuse 400 (%s), sans rien creer', async (_label, extra) => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase() as never);
    const admin = setupMockAdminClient();

    const res = await POST(buildPostRequest({ email: 'new@test.com', ...extra }));

    expect(res.status).toBe(400);
    expect(admin.createInvitation).not.toHaveBeenCalled();
  });

  it('un gerant invite un serveur (oui)', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ actor: MANAGER }) as never);
    setupMockAdminClient();

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));

    expect(res.status).toBe(201);
  });

  it('on ne donne pas un droit qu on n a pas: un caissier avec team.manage ne cree pas un gerant (403, rien cree)', async () => {
    mockRateLimit(true);
    const cashierWithTeam: ActorRow = {
      id: 'membership-cash',
      postes: ['cashier'],
      permission_overrides: { 'team.manage': true },
    };
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabase({ actor: cashierWithTeam }) as never,
    );
    const admin = setupMockAdminClient();

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['manager'] }));

    expect(res.status).toBe(403);
    expect(admin.createInvitation).not.toHaveBeenCalled();
  });
});

describe('POST /api/invitations - journal d audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('journalise la creation avec le bon auteur et le bon restaurant, sans le jeton', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase() as never);
    setupMockAdminClient();

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));
    expect(res.status).toBe(201);

    expect(mockCreateAuditService).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant-1',
      userId: 'user-1',
      userEmail: 'admin@test.com',
      userRole: 'owner',
    });
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    const entry = mockAuditLog.mock.calls[0][0] as Record<string, unknown>;
    expect(entry).toMatchObject({
      action: 'create',
      entityType: 'user',
      entityId: TEST_INVITATION_ID,
      metadata: { event: 'invitation_created', invitation_id: TEST_INVITATION_ID },
    });
    expect(JSON.stringify(entry)).not.toContain('secret');
    expect(JSON.stringify(entry)).not.toContain('token');
  });

  it('temoin negatif: un refus (403) ne journalise rien', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockSupabase() as never);
    setupMockAdminClient();
    // Un chef n'a pas team.manage.
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabase({ actor: { id: 'membership-chef', postes: ['chef'] } }) as never,
    );

    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));
    expect(res.status).toBe(403);
    expect(mockAuditLog).not.toHaveBeenCalled();
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

  it('returns 403 when a manager tries to cancel a peer (manager) invitation', async () => {
    // Anti-escalade: un gerant n'annule pas l'invitation d'un pair gerant (droits
    // non strictement inclus), posee par le proprietaire.
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(
      createMockDeleteSupabase({ actor: MANAGER }) as never,
    );
    setupMockAdminClient({ rights: { postes: ['manager'] } });
    const cancelInvitation = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createInvitationService).mockReturnValue({ cancelInvitation } as never);

    const res = await DELETE(buildDeleteRequest(), buildParams());

    expect(res.status).toBe(403);
    expect(cancelInvitation).not.toHaveBeenCalled();
  });

  it('temoin: le proprietaire annule l invitation d un gerant (meme requete, autre resultat)', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockDeleteSupabase({ actor: OWNER }) as never);
    setupMockAdminClient({ rights: { postes: ['manager'] } });
    const cancelInvitation = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createInvitationService).mockReturnValue({ cancelInvitation } as never);

    const res = await DELETE(buildDeleteRequest(), buildParams());

    expect(res.status).toBe(200);
    expect(cancelInvitation).toHaveBeenCalledWith(TEST_INVITATION_ID);
  });

  it('temoin: un gerant annule l invitation d un serveur', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(
      createMockDeleteSupabase({ actor: MANAGER }) as never,
    );
    setupMockAdminClient({ rights: { postes: ['waiter'] } });
    const cancelInvitation = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createInvitationService).mockReturnValue({ cancelInvitation } as never);

    const res = await DELETE(buildDeleteRequest(), buildParams());

    expect(res.status).toBe(200);
    expect(cancelInvitation).toHaveBeenCalledTimes(1);
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

  it('P-10: un renvoi consomme le meme plafond quotidien et est refuse au-dela', async () => {
    mockRateLimit(true);
    mockDailyQuota(false);
    vi.mocked(createClient).mockResolvedValue(createMockDeleteSupabase() as never);
    setupMockAdminClient();

    const res = await RESEND_POST(buildResendRequest(), buildParams());

    expect(res.status).toBe(429);
    expect(invitationTenantDailyLimiter.check).toHaveBeenCalledWith('tenant-1');
    expect(vi.mocked(createInvitationService)).not.toHaveBeenCalled();
  });

  it('P-10: un renvoi consomme le meme plafond quotidien et est refuse au-dela', async () => {
    mockRateLimit(true);
    mockDailyQuota(false);
    vi.mocked(createClient).mockResolvedValue(createMockDeleteSupabase() as never);
    setupMockAdminClient();
    vi.mocked(createInvitationService).mockClear();

    const res = await RESEND_POST(buildResendRequest(), buildParams());

    expect(res.status).toBe(429);
    expect(invitationTenantDailyLimiter.check).toHaveBeenCalledWith('tenant-1');
    expect(vi.mocked(createInvitationService)).not.toHaveBeenCalled();
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

  it('refuse a un gerant de renvoyer l invitation d un pair gerant (403, aucun courriel)', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(
      createMockDeleteSupabase({ actor: MANAGER }) as never,
    );
    setupMockAdminClient({ rights: { postes: ['manager'] } });
    const resendInvitation = vi.fn();
    vi.mocked(createInvitationService).mockReturnValue({ resendInvitation } as never);

    const res = await RESEND_POST(buildResendRequest(), buildParams());

    expect(res.status).toBe(403);
    expect(resendInvitation).not.toHaveBeenCalled();
  });

  it('temoin: le proprietaire renvoie l invitation d un gerant', async () => {
    mockRateLimit(true);
    vi.mocked(createClient).mockResolvedValue(createMockDeleteSupabase({ actor: OWNER }) as never);
    setupMockAdminClient({ rights: { postes: ['manager'] } });

    const res = await RESEND_POST(buildResendRequest(), buildParams());

    expect(res.status).toBe(200);
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

/**
 * X10/X11: inviter fait entrer du personnel, donc exige team.manage comme la
 * creation directe; et seul le proprietaire attache un reglage par personne
 * (permission_overrides, decision du 2026-11-09).
 */
describe('invitations - team.manage et permissions individuelles', () => {
  // Un chef n'a pas team.manage par defaut.
  const CHEF: ActorRow = { id: 'membership-chef', postes: ['chef'] };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit(true);
    mockDailyQuota(true);
  });

  it('GET refuse un membre sans team.manage', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ actor: CHEF }) as never);
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(403);
  });

  it('temoin: GET accepte un gerant (team.manage par defaut)', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ actor: MANAGER }) as never);
    setupMockAdminClient();
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
  });

  it('GET refuse un gerant a qui le proprietaire a retire team.manage', async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabase({
        actor: {
          id: 'membership-mgr',
          postes: ['manager'],
          permission_overrides: { 'team.manage': false },
        },
      }) as never,
    );
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(403);
  });

  it('POST refuse un membre sans team.manage, sans rien creer', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ actor: CHEF }) as never);
    const admin = setupMockAdminClient();
    const res = await POST(buildPostRequest({ email: 'new@test.com', postes: ['waiter'] }));
    expect(res.status).toBe(403);
    expect(admin.createInvitation).not.toHaveBeenCalled();
  });

  it('DELETE refuse un membre sans team.manage', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockDeleteSupabase({ actor: CHEF }) as never);
    setupMockAdminClient();
    const res = await DELETE(buildDeleteRequest(), buildParams());
    expect(res.status).toBe(403);
  });

  it('renvoi refuse a un membre sans team.manage', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockDeleteSupabase({ actor: CHEF }) as never);
    setupMockAdminClient();
    const res = await RESEND_POST(buildResendRequest(), buildParams());
    expect(res.status).toBe(403);
  });

  it('un gerant ne joint pas de permission_overrides a une invitation (403)', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ actor: MANAGER }) as never);
    setupMockAdminClient();
    const res = await POST(
      buildPostRequest({
        email: 'new@test.com',
        postes: ['waiter'],
        permission_overrides: { 'orders.pay': true },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('temoin: le proprietaire joint des permission_overrides (meme corps que le gerant refuse)', async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabase({ actor: OWNER }) as never);
    setupMockAdminClient();
    const res = await POST(
      buildPostRequest({
        email: 'new@test.com',
        postes: ['waiter'],
        permission_overrides: { 'orders.pay': true },
      }),
    );
    expect(res.status).toBe(201);
  });
});
