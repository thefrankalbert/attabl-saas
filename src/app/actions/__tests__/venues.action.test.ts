import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const mockCreateVenue = vi.fn();
const mockRenameVenue = vi.fn();
const mockDeactivateVenue = vi.fn();
const mockReactivateVenue = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('@/lib/rate-limit', () => ({
  restaurantCreateLimiter: { check: vi.fn(() => Promise.resolve({ success: true })) },
  getClientIpFromHeaders: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/auth/get-session', () => ({
  getAuthenticatedUserWithTenant: (...a: unknown[]) => mockAuth(...a),
  AuthError: class AuthError extends Error {},
}));
vi.mock('@/services/restaurant-group.service', () => ({
  createRestaurantGroupService: () => ({
    createVenue: mockCreateVenue,
    renameVenue: mockRenameVenue,
    deactivateVenue: mockDeactivateVenue,
    reactivateVenue: mockReactivateVenue,
  }),
}));

import {
  actionCreateVenue,
  actionRenameVenue,
  actionDeactivateVenue,
  actionReactivateVenue,
} from '@/app/actions/venues';

// ponytail: Zod v4's .uuid() enforces valid v4 variant/version nibbles ('11111111-1111-1111-...'
// fails); use a genuine v4 UUID fixture instead.
const UUID = '11111111-1111-4111-8111-111111111111';

function authOk() {
  mockAuth.mockResolvedValue({
    tenantId: 'tenant-1',
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  subscription_plan: 'business',
                  subscription_status: 'active',
                  trial_ends_at: null,
                },
                error: null,
              }),
          }),
        }),
      }),
    },
  });
}

describe('venues server actions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('actionCreateVenue : nom valide -> success avec data', async () => {
    authOk();
    mockCreateVenue.mockResolvedValue({ id: 'v2', name: 'Pool', slug: 'pool' });
    const res = await actionCreateVenue({ name: 'Pool' });
    expect(res).toEqual({ success: true, data: { id: 'v2', name: 'Pool', slug: 'pool' } });
    expect(mockCreateVenue).toHaveBeenCalled();
  });

  it('actionCreateVenue : nom vide -> success:false', async () => {
    authOk();
    const res = await actionCreateVenue({ name: '' });
    expect(res.success).toBe(false);
    expect(mockCreateVenue).not.toHaveBeenCalled();
  });

  it('actionRenameVenue : uuid invalide -> success:false', async () => {
    authOk();
    const res = await actionRenameVenue({ id: 'x', name: 'Pool' });
    expect(res.success).toBe(false);
  });

  it('actionDeactivateVenue : ok -> success:true', async () => {
    authOk();
    mockDeactivateVenue.mockResolvedValue(undefined);
    const res = await actionDeactivateVenue({ id: UUID });
    expect(res).toEqual({ success: true });
  });

  it('actionReactivateVenue : uuid valide -> success:true', async () => {
    authOk();
    mockReactivateVenue.mockResolvedValue(undefined);
    const res = await actionReactivateVenue({ id: UUID });
    expect(res).toEqual({ success: true });
    expect(mockReactivateVenue).toHaveBeenCalled();
  });

  it('actionReactivateVenue : uuid invalide -> success:false', async () => {
    authOk();
    const res = await actionReactivateVenue({ id: 'x' });
    expect(res.success).toBe(false);
    expect(mockReactivateVenue).not.toHaveBeenCalled();
  });
});
