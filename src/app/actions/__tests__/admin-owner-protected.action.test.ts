import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Autorite sur l'equipe (lot 1 des roles): un gerant a `team.manage` par defaut,
 * mais il n'agit JAMAIS sur le proprietaire, sur lui-meme ni sur un autre
 * gerant (droits non strictement inclus dans les siens). Le proprietaire ne se
 * desactive pas lui-meme. `owner` n'est pas attribuable et le reglage par
 * personne reste reserve au proprietaire.
 *
 * Vraie garde (canActOnMember, canGrantPostes, schemas Zod); seuls les
 * clients Supabase, le courriel et les limiteurs sont simules. Temoin dans
 * chaque bloc: les memes actions sur un serveur PASSENT. Sans la garde
 * canActOnMember, tous les cas refuses ci-dessous passeraient et echoueraient.
 */

vi.mock('@/lib/billing/assert-tenant-serving', async () => {
  const { AuthError } = await import('@/lib/auth/get-session');
  class TenantLockedError extends AuthError {
    constructor(message = 'Ce restaurant est temporairement indisponible') {
      super(message, 403);
    }
  }
  return { assertTenantServing: vi.fn(), TenantLockedError };
});

const mockGetAuthForTenant = vi.fn();
const adminUsersUpdate = vi.fn();
const adminRpc = vi.fn();
const updateUserById = vi.fn();
const generateLink = vi.fn();
const getUserById = vi.fn();
const mockSendReset = vi.fn();
const mockSendEmailChange = vi.fn();

type Target = { user_id: string; email: string; postes: string[]; is_active?: boolean };
let targetRow: Target | null = null;

function buildAdminClient() {
  return {
    rpc: (...args: unknown[]) => adminRpc(...args),
    auth: {
      admin: {
        updateUserById: (...a: unknown[]) => updateUserById(...a),
        generateLink: (...a: unknown[]) => generateLink(...a),
        getUserById: (...a: unknown[]) => getUserById(...a),
      },
    },
    from: (table: string) => {
      if (table === 'admin_users') {
        return {
          select: (cols: string) => {
            // Garde de perimetre: les appartenances du compte cible (une seule, ici).
            if (cols.includes('is_super_admin')) {
              return {
                eq: () =>
                  Promise.resolve({
                    data: [{ tenant_id: 'tenant-a', role: null, is_super_admin: false }],
                    error: null,
                  }),
              };
            }
            const terminal = () => ({
              is: () => terminal(),
              single: () => Promise.resolve({ data: targetRow, error: null }),
              maybeSingle: () => Promise.resolve({ data: targetRow, error: null }),
            });
            return { eq: () => ({ eq: () => terminal() }) };
          },
          update: (payload: unknown) => {
            adminUsersUpdate(payload);
            return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
          },
        };
      }
      if (table === 'poste_permissions') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                then: (ok: (v: unknown) => unknown) => ok({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { slug: 'resto-a' }, error: null }),
            maybeSingle: () => Promise.resolve({ data: { slug: 'resto-a' }, error: null }),
          }),
        }),
      };
    },
  };
}
let adminClient = buildAdminClient();

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}));
vi.mock('@/lib/rate-limit', () => ({
  adminPasswordResetLinkLimiter: { check: async () => ({ success: true }) },
  adminPasswordResetLinkIpLimiter: { check: async () => ({ success: true }) },
  getClientIpFromHeaders: (h: Headers) => h.get('x-forwarded-for') ?? 'anonymous',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: (...args: unknown[]) => mockGetAuthForTenant(...args),
  AuthError: class AuthError extends Error {
    status = 403;
  },
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }));
vi.mock('@/services/plan-enforcement.service', async (importActual) => ({
  ...(await importActual<typeof import('@/services/plan-enforcement.service')>()),
  createPlanEnforcementService: () => ({
    canAddStaff: vi.fn(async () => undefined),
    canAddAdmin: vi.fn(async () => undefined),
  }),
}));
vi.mock('@/services/member-session.service', () => ({
  createMemberSessionService: () => ({ revokeSessionsAfterRemoval: vi.fn(async () => 'revoked') }),
}));
vi.mock('@/services/audit.service', () => ({ createAuditService: () => ({ log: vi.fn() }) }));
vi.mock('@/services/storage-cleanup.service', () => ({
  getStorageCleanup: () => ({ purgeTenant: async () => undefined }),
}));
vi.mock('@/services/email.service', () => ({
  sendPasswordResetEmail: (...a: unknown[]) => mockSendReset(...a),
  sendEmailChangeApprovalToCurrentAddress: (...a: unknown[]) => mockSendEmailChange(...a),
}));

import {
  actionDeleteAdminUser,
  actionResetUserPassword,
  actionUpdateAdminUser,
  actionUpdateUserEmail,
} from '@/app/actions/admin';
import { getEffectiveLevels } from '@/lib/permissions';
import type { Poste } from '@/types/permission.types';

const TENANT = 'tenant-a';
const TARGET_ROW_ID = 'target-admin-row';

function actor(postes: Poste[], adminUserId: string) {
  mockGetAuthForTenant.mockResolvedValue({
    user: { id: 'actor-auth-id', email: 'actor@resto-a.test' },
    postes,
    isOwner: postes.includes('owner'),
    levels: getEffectiveLevels({ postes }),
    adminUserId,
    tenantId: TENANT,
    supabase: {},
  });
}

function target(postes: string[]) {
  targetRow = { user_id: 'local-auth-id', email: 'cible@resto-a.test', postes, is_active: true };
}

/** Les cinq gestes d'equipe, sur la cible courante. */
const gestes: Array<[string, (id: string) => Promise<{ success?: boolean; error?: string }>]> = [
  ['desactiver', (id) => actionUpdateAdminUser(TENANT, id, { is_active: false })],
  ['retirer', (id) => actionDeleteAdminUser(TENANT, id)],
  ['changer l email', (id) => actionUpdateUserEmail(TENANT, id, 'neuf@resto-a.test')],
  ['reinitialiser le mot de passe', (id) => actionResetUserPassword(TENANT, id)],
  ['changer le poste', (id) => actionUpdateAdminUser(TENANT, id, { postes: ['cashier'] })],
];

function nothingWritten() {
  expect(adminUsersUpdate).not.toHaveBeenCalled();
  expect(adminRpc).not.toHaveBeenCalled();
  expect(updateUserById).not.toHaveBeenCalled();
  expect(generateLink).not.toHaveBeenCalled();
  expect(mockSendReset).not.toHaveBeenCalled();
  expect(mockSendEmailChange).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  adminClient = buildAdminClient();
  targetRow = null;
  updateUserById.mockResolvedValue({ error: null });
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: 'hashed-token' } },
    error: null,
  });
  getUserById.mockResolvedValue({
    data: { user: { id: 'local-auth-id', email: 'cible@resto-a.test' } },
    error: null,
  });
  mockSendReset.mockResolvedValue(true);
  mockSendEmailChange.mockResolvedValue(true);
  adminRpc.mockResolvedValue({ data: false, error: null });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-secret-key';
});

describe('un gerant n agit jamais sur le proprietaire', () => {
  it.each(gestes)('gerant: refuse de %s le proprietaire, rien n est ecrit', async (_nom, geste) => {
    actor(['manager'], 'manager-row');
    target(['owner']);
    const res = await geste(TARGET_ROW_ID);
    expect(res.error).toBe('permissionDenied');
    expect(res.success).toBeUndefined();
    nothingWritten();
  });

  it('le proprietaire ne peut pas se desactiver lui-meme', async () => {
    actor(['owner'], 'owner-row');
    target(['owner']);
    const res = await actionUpdateAdminUser(TENANT, 'owner-row', { is_active: false });
    expect(res.error).toBe('permissionDenied');
    nothingWritten();
  });

  it('le proprietaire ne peut pas se retirer lui-meme', async () => {
    actor(['owner'], 'owner-row');
    target(['owner']);
    const res = await actionDeleteAdminUser(TENANT, 'owner-row');
    expect(res.error).toBe('permissionDenied');
    nothingWritten();
  });
});

describe('un gerant n agit pas sur un autre gerant', () => {
  it.each(gestes)('gerant: refuse de %s un autre gerant, rien n est ecrit', async (_nom, geste) => {
    actor(['manager'], 'manager-row');
    target(['manager']);
    const res = await geste(TARGET_ROW_ID);
    expect(res.error).toBe('permissionDenied');
    nothingWritten();
  });

  it('gerant: refuse d agir sur soi-meme', async () => {
    actor(['manager'], 'manager-row');
    target(['manager']);
    const res = await actionUpdateAdminUser(TENANT, 'manager-row', { is_active: false });
    expect(res.error).toBe('permissionDenied');
    nothingWritten();
  });
});

describe('temoin: les memes gestes sur un serveur passent', () => {
  it.each(gestes)('gerant: peut %s un serveur', async (_nom, geste) => {
    actor(['manager'], 'manager-row');
    target(['waiter']);
    const res = await geste(TARGET_ROW_ID);
    expect(res.success).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('proprietaire: peut desactiver un gerant (poste inferieur au sien)', async () => {
    actor(['owner'], 'owner-row');
    target(['manager']);
    const res = await actionUpdateAdminUser(TENANT, TARGET_ROW_ID, { is_active: false });
    expect(res.success).toBe(true);
    expect(adminUsersUpdate).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
  });
});

describe('attribution: owner et reglage par personne', () => {
  it('un gerant ne peut pas attribuer le poste owner (refus du schema)', async () => {
    actor(['manager'], 'manager-row');
    target(['waiter']);
    const res = await actionUpdateAdminUser(TENANT, TARGET_ROW_ID, {
      // @ts-expect-error - owner n'est pas un poste attribuable (StaffPoste)
      postes: ['owner'],
    });
    expect(res.error).toBeTruthy();
    expect(res.success).toBeUndefined();
    expect(adminUsersUpdate).not.toHaveBeenCalled();
  });

  it('le proprietaire non plus ne peut pas attribuer owner', async () => {
    actor(['owner'], 'owner-row');
    target(['waiter']);
    const res = await actionUpdateAdminUser(TENANT, TARGET_ROW_ID, {
      // @ts-expect-error - owner n'est pas un poste attribuable (StaffPoste)
      postes: ['owner'],
    });
    expect(res.error).toBeTruthy();
    expect(adminUsersUpdate).not.toHaveBeenCalled();
  });

  it('un gerant ne peut pas poser permission_overrides', async () => {
    actor(['manager'], 'manager-row');
    target(['waiter']);
    const res = await actionUpdateAdminUser(TENANT, TARGET_ROW_ID, {
      permission_overrides: { 'orders.pay': true },
    });
    expect(res.error).toBe('permissionDenied');
    expect(adminUsersUpdate).not.toHaveBeenCalled();
  });

  it('temoin: le proprietaire pose permission_overrides sur un serveur', async () => {
    actor(['owner'], 'owner-row');
    target(['waiter']);
    const res = await actionUpdateAdminUser(TENANT, TARGET_ROW_ID, {
      permission_overrides: { 'orders.pay': true },
    });
    expect(res.success).toBe(true);
    expect(adminUsersUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ permission_overrides: { 'orders.pay': true } }),
    );
  });

  it('un gerant ne donne pas un poste qui ouvre plus que ses droits (un caissier avec team.manage ne cree pas de gerant)', async () => {
    // On ne donne pas un droit qu'on n'a pas: un caissier a qui l'on a donne
    // team.manage ne peut pas attribuer le poste gerant (canGrantPostes).
    mockGetAuthForTenant.mockResolvedValue({
      user: { id: 'actor-auth-id', email: 'actor@resto-a.test' },
      postes: ['cashier'],
      isOwner: false,
      levels: getEffectiveLevels({
        postes: ['cashier'],
        permission_overrides: { 'team.manage': true },
      }),
      adminUserId: 'cashier-row',
      tenantId: TENANT,
      supabase: {},
    });
    target(['waiter']);
    const res = await actionUpdateAdminUser(TENANT, TARGET_ROW_ID, { postes: ['manager'] });
    expect(res.error).toBe('permissionDenied');
    expect(adminUsersUpdate).not.toHaveBeenCalled();
  });
});
