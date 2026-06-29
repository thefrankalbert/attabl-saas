import { describe, it, expect, vi } from 'vitest';
import { createRestaurantGroupService } from '../restaurant-group.service';

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
