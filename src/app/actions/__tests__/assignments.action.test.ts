import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Audit des offres 2026-11-20: "Assignation serveurs" est vendue a partir de
 * Pro. La page Service etait fermee, mais l'action actionAssignServer (endpoint
 * POST adressable par son Action ID, et relayee par /api/orders/mutations pour
 * la file hors ligne) ne regardait pas le plan.
 */

vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserForTenant: vi.fn(async () => ({})),
  AuthError: class AuthError extends Error {},
}));
vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn(async () => undefined),
  TenantLockedError: class TenantLockedError extends Error {},
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));

const mockEntitled = vi.fn();
vi.mock('@/lib/plans/assert-feature', () => ({
  isFeatureEntitled: (...a: unknown[]) => mockEntitled(...a),
}));

const mockAssign = vi.fn();
const mockRelease = vi.fn();
vi.mock('@/services/assignment.service', () => ({
  createAssignmentService: vi.fn(() => ({
    assignServerToTable: mockAssign,
    releaseAssignment: mockRelease,
  })),
}));

import { actionAssignServer, actionReleaseAssignment } from '../assignments';

const TENANT = '550e8400-e29b-41d4-a716-446655440000';
const TABLE = '550e8400-e29b-41d4-a716-446655440001';
const SERVER = '550e8400-e29b-41d4-a716-446655440002';

beforeEach(() => {
  vi.clearAllMocks();
  mockAssign.mockResolvedValue({ id: 'a-1' });
  mockRelease.mockResolvedValue(undefined);
});

describe('actionAssignServer - plan', () => {
  it('refuse un restaurant dont le plan n inclut pas l assignation', async () => {
    mockEntitled.mockResolvedValue(false);
    const res = await actionAssignServer(TENANT, TABLE, SERVER);
    expect(res.error).toMatch(/pas inclus dans votre plan/);
    expect(mockEntitled).toHaveBeenCalledWith(expect.anything(), TENANT, 'canAccessService');
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it('laisse assigner un restaurant Pro ou plus', async () => {
    mockEntitled.mockResolvedValue(true);
    const res = await actionAssignServer(TENANT, TABLE, SERVER);
    expect(res.success).toBe(true);
    expect(mockAssign).toHaveBeenCalledWith(TENANT, TABLE, SERVER);
  });

  it('liberer une assignation reste permis apres une retrogradation', async () => {
    mockEntitled.mockResolvedValue(false);
    const res = await actionReleaseAssignment(TENANT, '550e8400-e29b-41d4-a716-446655440003');
    expect(res.success).toBe(true);
    expect(mockRelease).toHaveBeenCalled();
  });
});
