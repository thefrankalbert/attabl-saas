import { describe, it, expect, vi } from 'vitest';
import { createSignupService } from '../signup.service';
import { ServiceError } from '../errors';

/**
 * Creates a configurable mock Supabase client for signup tests.
 */
function createMockSupabase(
  options: {
    slugExists?: boolean;
    tenantInsertError?: boolean;
    adminInsertError?: boolean;
    authCreateError?: boolean;
  } = {},
) {
  const mockDeleteUser = vi.fn().mockResolvedValue({ error: null });

  const auth = {
    admin: {
      createUser: vi
        .fn()
        .mockResolvedValue(
          options.authCreateError
            ? { data: null, error: { message: 'Email already exists' } }
            : { data: { user: { id: 'user-abc-123' } }, error: null },
        ),
      deleteUser: mockDeleteUser,
    },
  };

  const tableResponses: Record<string, Record<string, unknown>> = {
    tenants: options.tenantInsertError
      ? { data: null, error: { message: 'Insert failed' } }
      : { data: { id: 'tenant-xyz', slug: 'mon-restaurant' }, error: null },
    admin_users: options.adminInsertError
      ? { error: { message: 'Admin insert failed' } }
      : { error: null },
    venues: { error: null },
    restaurant_groups: { data: { id: 'group-abc-123' }, error: null },
  };

  const from = vi.fn((table: string) => {
    return {
      select: vi.fn().mockReturnValue({
        like: vi.fn().mockResolvedValue({
          data: options.slugExists ? [{ slug: 'mon-restaurant' }] : [],
          error: null,
        }),
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: options.slugExists ? { slug: 'mon-restaurant' } : null,
            error: options.slugExists ? null : { code: 'PGRST116' },
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(tableResponses[table] || { data: null, error: null }),
        }),
        // For admin_users and venues which don't chain .select()
        then: undefined,
        ...tableResponses[table],
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  });

  const mockRpc = vi.fn().mockResolvedValue({
    data: { tenantId: 'tenant-xyz', slug: 'mon-restaurant', groupId: 'group-abc-123' },
    error: null,
  });

  return {
    from,
    auth,
    rpc: mockRpc,
    _mockDeleteUser: mockDeleteUser,
    _mockRpc: mockRpc,
  } as unknown as Parameters<typeof createSignupService>[0] & {
    _mockDeleteUser: ReturnType<typeof vi.fn>;
    _mockRpc: ReturnType<typeof vi.fn>;
  };
}

describe('SignupService', () => {
  describe('completeEmailSignup', () => {
    it('should create a user, tenant, admin user, and venue successfully', async () => {
      const supabase = createMockSupabase();
      const service = createSignupService(supabase);

      const result = await service.completeEmailSignup({
        restaurantName: 'Mon Restaurant',
        email: 'test@example.com',
        password: 'securepass123',
      });

      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('tenantId');
    });

    it('should use default plan "starter" when no plan specified', async () => {
      const supabase = createMockSupabase();
      const service = createSignupService(supabase);

      await service.completeEmailSignup({
        restaurantName: 'Test',
        email: 'test@example.com',
        password: 'securepass123',
      });

      expect(supabase._mockRpc).toHaveBeenCalledWith(
        'provision_signup_tenant',
        expect.objectContaining({ p_plan: 'starter' }),
      );
    });

    it('should throw CONFLICT when auth user email already exists', async () => {
      const supabase = createMockSupabase({ authCreateError: true });
      const service = createSignupService(supabase);

      await expect(
        service.completeEmailSignup({
          restaurantName: 'Test',
          email: 'existing@email.com',
          password: 'password123',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('should rollback auth user when tenant provision RPC fails', async () => {
      const supabase = createMockSupabase();
      supabase._mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });
      const service = createSignupService(supabase);

      await expect(
        service.completeEmailSignup({
          restaurantName: 'Test',
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ServiceError);

      expect(supabase._mockDeleteUser).toHaveBeenCalledWith('user-abc-123');
    });
  });

  describe('completeOAuthSignup', () => {
    it('should create tenant, admin user, and venue for OAuth user', async () => {
      const supabase = createMockSupabase();
      const service = createSignupService(supabase);

      const result = await service.completeOAuthSignup({
        userId: 'oauth-user-123',
        email: 'oauth@example.com',
        restaurantName: 'OAuth Restaurant',
      });

      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('tenantId');
    });

    it('should not create an auth user (already exists via OAuth)', async () => {
      const supabase = createMockSupabase();
      const service = createSignupService(supabase);

      await service.completeOAuthSignup({
        userId: 'oauth-user-123',
        email: 'oauth@example.com',
        restaurantName: 'Test',
      });

      // auth.admin.createUser should NOT have been called
      expect(
        (supabase as unknown as Record<string, Record<string, Record<string, unknown>>>).auth.admin
          .createUser,
      ).not.toHaveBeenCalled();
    });

    it('returns existing tenant when admin_users already exists', async () => {
      const supabase = createMockSupabase();
      const service = createSignupService(supabase);

      const fromMock = supabase.from as ReturnType<typeof vi.fn>;
      fromMock.mockImplementation((table: string) => {
        if (table === 'admin_users') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          tenant_id: 'tenant-existing',
                          tenants: { slug: 'existing-slug' },
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            like: vi.fn().mockResolvedValue({ data: [], error: null }),
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      });

      const result = await service.ensureTenantForOnboarding({
        userId: 'user-1',
        email: 'owner@example.com',
        restaurantName: 'Test',
      });

      expect(result).toEqual({ tenantId: 'tenant-existing', slug: 'existing-slug' });
    });

    it('should throw when provision RPC fails for OAuth signup', async () => {
      const supabase = createMockSupabase();
      supabase._mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } });
      const service = createSignupService(supabase);

      await expect(
        service.completeOAuthSignup({
          userId: 'oauth-user-123',
          email: 'oauth@example.com',
          restaurantName: 'Test',
        }),
      ).rejects.toThrow(ServiceError);
    });
  });
});
