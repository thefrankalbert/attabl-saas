import { describe, it, expect, vi } from 'vitest';
import { createRestaurantGroupService } from '../restaurant-group.service';

function createMockSupabase(
  options: {
    groupExists?: boolean;
    groupInsertError?: boolean;
    tenantInsertError?: boolean;
    adminInsertError?: boolean;
    slugExists?: boolean;
  } = {},
) {
  const tableResponses: Record<string, Record<string, unknown>> = {
    restaurant_groups: options.groupInsertError
      ? { data: null, error: { message: 'Insert failed' } }
      : { data: { id: 'group-123', owner_user_id: 'user-abc' }, error: null },
    tenants: options.tenantInsertError
      ? { data: null, error: { message: 'Tenant insert failed' } }
      : {
          data: { id: 'tenant-xyz', slug: 'le-radisson', name: 'Le Radisson' },
          error: null,
        },
    admin_users: options.adminInsertError
      ? { error: { message: 'Admin insert failed' } }
      : { error: null },
    venues: { error: null },
  };

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
              : table === 'tenants'
                ? options.slugExists
                  ? { data: { slug: 'le-radisson' }, error: null }
                  : { data: null, error: { code: 'PGRST116' } }
                : { data: null, error: null },
          ),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(tableResponses[table] || { data: null, error: null }),
      }),
      ...tableResponses[table],
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }));

  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
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
    it('creates tenant, admin_user, and venue', async () => {
      const supabase = createMockSupabase({ groupExists: true });
      const service = createRestaurantGroupService(supabase);
      const result = await service.addRestaurantToGroup({
        groupId: 'group-123',
        userId: 'user-abc',
        email: 'owner@test.com',
        name: 'Le Radisson',
        slug: 'le-radisson',
        type: 'hotel',
        plan: 'premium',
      });
      expect(result.tenantId).toBe('tenant-xyz');
      expect(result.slug).toBe('le-radisson');
    });

    it('throws on tenant insert error', async () => {
      const supabase = createMockSupabase({ groupExists: true, tenantInsertError: true });
      const service = createRestaurantGroupService(supabase);
      await expect(
        service.addRestaurantToGroup({
          groupId: 'group-123',
          userId: 'user-abc',
          email: 'owner@test.com',
          name: 'Le Radisson',
          slug: 'le-radisson',
          type: 'hotel',
          plan: 'premium',
        }),
      ).rejects.toThrow('Tenant insert failed');
    });
  });
});
