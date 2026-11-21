/**
 * Liberer une assignation: la garde de l'action serveur.
 *
 * Les routes /api/assignments ont ete supprimees (aucun appelant). Le seul
 * chemin restant est cette action: sa garde (appartenance au restaurant, role
 * de gerant, `orders.manage`) n'etait testee nulle part.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock est remonte en tete du fichier: ce qu'il reference doit l'etre aussi.
const { FakeAuthError, mockAuth, mockRelease } = vi.hoisted(() => ({
  FakeAuthError: class FakeAuthError extends Error {},
  mockAuth: vi.fn(),
  mockRelease: vi.fn(),
}));
vi.mock('@/lib/auth/get-session', () => ({
  AuthError: FakeAuthError,
  getAuthenticatedUserForTenant: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  TenantLockedError: class TenantLockedError extends Error {},
  assertTenantServing: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));

vi.mock('@/services/assignment.service', () => ({
  createAssignmentService: () => ({ releaseAssignment: mockRelease }),
}));

import { actionReleaseAssignment } from '../assignments';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const ASSIGNMENT_OF_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: 'u-1' });
  mockRelease.mockResolvedValue(undefined);
});

describe('actionReleaseAssignment', () => {
  it('refuse sans rien liberer quand l utilisateur n est pas gerant de ce restaurant', async () => {
    mockAuth.mockRejectedValue(new FakeAuthError('Acces refuse'));

    const result = await actionReleaseAssignment(TENANT_A, ASSIGNMENT_OF_B);

    expect(result.success).toBeUndefined();
    expect(result.error).toEqual(expect.any(String));
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('exige un role de gerant ET orders.manage sur le restaurant vise', async () => {
    await actionReleaseAssignment(TENANT_A, ASSIGNMENT_OF_B);

    expect(mockAuth).toHaveBeenCalledWith(TENANT_A, ['owner', 'admin', 'manager'], 'orders.manage');
  });

  it('libere en bornant au restaurant verifie (jamais un autre)', async () => {
    const result = await actionReleaseAssignment(TENANT_A, ASSIGNMENT_OF_B);

    expect(result).toEqual({ success: true });
    expect(mockRelease).toHaveBeenCalledWith(ASSIGNMENT_OF_B, TENANT_A);
  });

  it('refuse un identifiant mal forme avant toute lecture', async () => {
    const result = await actionReleaseAssignment(TENANT_A, 'pas-un-uuid');

    expect(result).toEqual({ error: 'Invalid input' });
    expect(mockAuth).not.toHaveBeenCalled();
  });
});
