import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRestaurantGroupService } from '../restaurant-group.service';
import { ServiceError } from '../errors';
import type { Tenant } from '@/types/admin.types';

function createMockSupabase(
  options: {
    groupExists?: boolean;
    groupInsertError?: boolean;
    addRestaurantError?: 'generic' | 'nameConflict';
  } = {},
) {
  const from = vi.fn((table: string) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue(
            table === 'restaurant_groups'
              ? options.groupExists
                ? { data: { id: 'group-123', owner_user_id: 'user-abc' }, error: null }
                : { data: null, error: { code: 'PGRST116' } }
              : { data: null, error: null },
          ),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue(
            table === 'restaurant_groups'
              ? options.groupInsertError
                ? { data: null, error: { message: 'Insert failed' } }
                : { data: { id: 'group-123', owner_user_id: 'user-abc' }, error: null }
              : { data: null, error: null },
          ),
      }),
    }),
  }));

  const rpc = vi.fn().mockResolvedValue(
    options.addRestaurantError === 'generic'
      ? { data: null, error: { message: 'Tenant insert failed' } }
      : options.addRestaurantError === 'nameConflict'
        ? {
            data: null,
            error: { message: 'tenant_name_cross_group_conflict', code: '23505' },
          }
        : { data: { tenantId: 'tenant-xyz', slug: 'le-radisson' }, error: null },
  );

  return { from, rpc } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('restaurant-group.service', () => {
  describe('getOrCreateGroup', () => {
    it('returns existing group if one exists', async () => {
      const supabase = createMockSupabase({ groupExists: true });
      const service = createRestaurantGroupService(supabase);
      const group = await service.getOrCreateGroup('user-abc');
      expect(group.id).toBe('group-123');
    });

    it('creates a new group if none exists', async () => {
      const supabase = createMockSupabase({ groupExists: false });
      const service = createRestaurantGroupService(supabase);
      const group = await service.getOrCreateGroup('user-abc');
      expect(group.id).toBe('group-123');
      expect(supabase.from).toHaveBeenCalledWith('restaurant_groups');
    });

    it('throws on insert error', async () => {
      const supabase = createMockSupabase({ groupExists: false, groupInsertError: true });
      const service = createRestaurantGroupService(supabase);
      await expect(service.getOrCreateGroup('user-abc')).rejects.toThrow('Insert failed');
    });
  });

  describe('addRestaurantToGroup', () => {
    const validInput = {
      groupId: 'group-123',
      userId: 'user-abc',
      email: 'owner@test.com',
      name: 'Le Radisson',
      slug: 'le-radisson',
      type: 'hotel',
      plan: 'pro',
    };

    it('creates the restaurant atomically via the RPC', async () => {
      const supabase = createMockSupabase();
      const service = createRestaurantGroupService(supabase);
      const result = await service.addRestaurantToGroup(validInput);
      expect(result.tenantId).toBe('tenant-xyz');
      expect(result.slug).toBe('le-radisson');
      expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
        'provision_group_restaurant',
        expect.objectContaining({ p_group_id: 'group-123', p_name: 'Le Radisson' }),
      );
    });

    it('throws INTERNAL on a generic RPC error', async () => {
      const supabase = createMockSupabase({ addRestaurantError: 'generic' });
      const service = createRestaurantGroupService(supabase);
      await expect(service.addRestaurantToGroup(validInput)).rejects.toThrow(
        'Tenant insert failed',
      );
    });

    it('throws CONFLICT (RESTAURANT_NAME_TAKEN) when the name is used by another group', async () => {
      const supabase = createMockSupabase({ addRestaurantError: 'nameConflict' });
      const service = createRestaurantGroupService(supabase);
      await expect(service.addRestaurantToGroup(validInput)).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'RESTAURANT_NAME_TAKEN',
      });
    });
  });
});

// canAddVenue lit getPlanLimits(plan,status,trialEndsAt) puis compte les venues is_active.
// On mock le client Supabase par methode.

function makeVenueTenant(plan: string): Tenant {
  return {
    id: 'tenant-1',
    subscription_plan: plan,
    subscription_status: 'active',
    trial_ends_at: null,
  } as unknown as Tenant;
}

describe('restaurant-group.service - espaces (venues)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createVenue : Starter (maxVenues=1) avec deja 1 venue actif -> VALIDATION', async () => {
    // count venues actifs = 1 pour canAddVenue
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: 1, error: null })),
          })),
        })),
      })),
    } as never;
    const svc = createRestaurantGroupService(supabase);
    await expect(svc.createVenue(makeVenueTenant('starter'), 'Panorama')).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it('createVenue : Business insere name + slug scope-tenant unique + is_active', async () => {
    const inserted: Record<string, unknown>[] = [];
    // 1er from('venues') = canAddVenue count (0) ; 2e = slug lookup (aucun) ; 3e = insert
    let call = 0;
    const supabase = {
      from: vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => Promise.resolve({ count: 0, error: null })),
              })),
            })),
          };
        }
        if (call === 2) {
          // slug uniqueness lookup: retourne aucune ligne
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                like: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          };
        }
        return {
          insert: vi.fn((rows: Record<string, unknown>[]) => {
            inserted.push(rows[0]);
            return {
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: 'venue-2', name: rows[0].name, slug: rows[0].slug },
                    error: null,
                  }),
                ),
              })),
            };
          }),
        };
      }),
    } as never;
    const svc = createRestaurantGroupService(supabase);
    const res = await svc.createVenue(makeVenueTenant('business'), 'Lobby bar');
    expect(res.slug).toBe('lobby-bar');
    expect(inserted[0]).toMatchObject({
      tenant_id: 'tenant-1',
      name: 'Lobby bar',
      slug: 'lobby-bar',
      is_active: true,
    });
  });

  it('deactivateVenue : refuse le dernier espace actif (count < 2) -> VALIDATION', async () => {
    // from('venues') 1: assertVenueOwnedByTenant (maybeSingle -> found) ; 2: count actifs = 1
    let call = 0;
    const supabase = {
      from: vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'v1' }, error: null })),
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ count: 1, error: null })),
            })),
          })),
        };
      }),
    } as never;
    const svc = createRestaurantGroupService(supabase);
    await expect(svc.deactivateVenue('tenant-1', 'v1')).rejects.toBeInstanceOf(ServiceError);
  });

  it('renameVenue : venue d un autre tenant -> NOT_FOUND (garde propriete)', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),
    } as never;
    const svc = createRestaurantGroupService(supabase);
    await expect(svc.renameVenue('tenant-1', 'foreign', 'Pool')).rejects.toBeInstanceOf(
      ServiceError,
    );
  });
});
