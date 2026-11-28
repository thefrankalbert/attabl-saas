import { describe, it, expect, vi, beforeEach } from 'vitest';

// Coupure du restaurant (A-02): la garde est simulee ici, ses refus sont testes
// dans tenant-lock-routes.test.ts.
vi.mock('@/lib/billing/tenant-lock-response', () => ({
  tenantLockResponse: vi.fn(async () => null),
}));

// /api/admin/reset efface les commandes, payees comprises, avec l'historique
// des paiements. Decision du 2026-11-09: seul le proprietaire touche a
// l'historique de l'argent. Un admin passait, sans permission fine a lui
// retirer.

const { mockAuth, mockRpc, mockInsert, mockFrom } = vi.hoisted(() => {
  const mockInsert = vi.fn();
  return {
    mockAuth: vi.fn(),
    mockRpc: vi.fn(),
    mockInsert,
    mockFrom: vi.fn(() => ({ insert: mockInsert })),
  };
});

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/rate-limit', () => ({
  adminResetLimiter: { check: vi.fn(() => Promise.resolve({ success: true })) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn(() => null) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: () => mockAuth(),
  AuthError: class AuthError extends Error {},
}));

import { POST } from '@/app/api/admin/reset/route';
import { getEffectiveLevels } from '@/lib/permissions';
import type { PermissionMap, Poste } from '@/types/permission.types';

function resetRequest(): Request {
  return new Request('http://localhost/api/admin/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetType: 'orders', confirmationText: 'CONFIRMER SUPPRESSION' }),
  });
}

function as(poste: Poste, overrides?: PermissionMap): void {
  const member = { postes: [poste], permission_overrides: overrides ?? null };
  mockAuth.mockResolvedValue({
    tenantId: 'tenant-1',
    user: { id: 'user-1' },
    postes: member.postes,
    isOwner: poste === 'owner',
    levels: getEffectiveLevels(member),
  });
}

describe('POST /api/admin/reset - reserve au proprietaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: { orders_deleted: 3 }, error: null });
    mockInsert.mockResolvedValue({ error: null });
  });

  it.each(['manager', 'cashier', 'chef', 'waiter'] as const)(
    'refuse le poste %s',
    async (poste) => {
      as(poste);
      const res = await POST(resetRequest());
      expect(res.status).toBe(403);
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  it('refuse un gerant meme avec tous les droits d argent accordes (proprietaire seulement)', async () => {
    as('manager', { 'billing.manage': true, 'team.manage': true });
    const res = await POST(resetRequest());
    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('laisse le proprietaire reinitialiser son restaurant', async () => {
    as('owner');
    const res = await POST(resetRequest());
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('reset_tenant_data', {
      p_tenant_id: 'tenant-1',
      p_reset_type: 'orders',
    });
  });

  it('trace la demande AVANT l effacement, puis le bilan chiffre', async () => {
    as('owner');
    const ordre: string[] = [];
    mockInsert.mockImplementation(async (r: { metadata: { phase: string } }) => {
      ordre.push(`audit:${r.metadata.phase}`);
      return { error: null };
    });
    mockRpc.mockImplementation(async () => {
      ordre.push('effacement');
      return {
        data: { orders_deleted: 3, items_deleted: 7, movements_deleted: 0, coupons_reset: 0 },
        error: null,
      };
    });
    const res = await POST(resetRequest());
    expect(res.status).toBe(200);
    expect(ordre).toEqual(['audit:demandee', 'effacement', 'audit:effectuee']);
    expect(mockFrom).toHaveBeenCalledWith('audit_log');
    expect(mockInsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        user_role: 'owner',
        action: 'delete',
        entity_type: 'order',
        metadata: expect.objectContaining({
          operation: 'reset_tenant_data',
          resetType: 'orders',
          ordersDeleted: 3,
          itemsDeleted: 7,
        }),
      }),
    );
  });

  it('n efface RIEN si la trace d audit ne peut pas etre ecrite', async () => {
    as('owner');
    mockInsert.mockResolvedValue({ error: { message: 'refus' } });
    const res = await POST(resetRequest());
    expect(res.status).toBe(500);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('effacement en echec: seule la demande est tracee, pas de bilan (temoin)', async () => {
    as('owner');
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await POST(resetRequest());
    expect(res.status).toBe(500);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ phase: 'demandee' }) }),
    );
  });
});
