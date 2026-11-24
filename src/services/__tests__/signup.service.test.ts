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
            ? { data: null, error: { code: 'email_exists', message: 'User already registered' } }
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
        message: 'EMAIL_ALREADY_REGISTERED',
      });
    });

    it('contre-audit 4: tout autre refus de GoTrue devient un refus neutre, sans texte brut', async () => {
      const cas = [
        [
          {
            code: 'validation_failed',
            status: 400,
            message: 'Password cannot be longer than 72 characters',
          },
          'PASSWORD_REJECTED_BY_AUTH',
        ],
        [
          { code: 'validation_failed', status: 400, message: 'Unable to validate email address' },
          'SIGNUP_REJECTED_BY_AUTH',
        ],
        [
          { code: 'unexpected_failure', status: 500, message: 'HIBP check failed' },
          'SIGNUP_REJECTED_BY_AUTH',
        ],
      ] as const;
      for (const [error, expected] of cas) {
        const supabase = createMockSupabase();
        vi.mocked(supabase.auth.admin.createUser).mockResolvedValue({
          data: { user: null },
          error,
        } as never);
        const err = await createSignupService(supabase)
          .completeEmailSignup({
            restaurantName: 'Test',
            email: 'test@example.com',
            password: 'password123',
          })
          .catch((e: unknown) => e);

        expect(err).toMatchObject({ code: 'CONFLICT', message: expected });
        expect(supabase._mockRpc).not.toHaveBeenCalled();
      }
    });

    it('contre-audit 2: weak_password (422 chez GoTrue) devient un refus neutre, distinct du doublon', async () => {
      const supabase = createMockSupabase();
      vi.mocked(supabase.auth.admin.createUser).mockResolvedValue({
        data: { user: null },
        error: {
          code: 'weak_password',
          status: 422,
          message: 'Password is known to be weak and easy to guess',
        },
      } as never);
      const err = await createSignupService(supabase)
        .completeEmailSignup({
          restaurantName: 'T',
          email: 'test@example.com',
          password: 'password123',
        })
        .catch((e: unknown) => e);

      // CONFLICT comme le doublon (la route repond alors pareil), mais code a
      // part pour envoyer le bon courriel; aucun texte GoTrue, rien de cree.
      expect(err).toMatchObject({ code: 'CONFLICT', message: 'PASSWORD_REJECTED_BY_AUTH' });
      expect(supabase._mockRpc).not.toHaveBeenCalled();
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

// B66: messages fixes pour le rattachement du proprietaire et la salle par defaut.
describe('SignupService: messages Postgres retenus au journal (B66)', () => {
  it('createAdminUser: le message renvoye ne contient pas le texte Postgres', async () => {
    const supabase = createMockSupabase({ adminInsertError: true });
    const err = await createSignupService(supabase)
      .createAdminUser({ tenantId: 't-1', userId: 'u-1', email: 'a@b.c', fullName: 'A' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).code).toBe('INTERNAL');
    expect((err as ServiceError).message).not.toContain('Admin insert failed');
  });

  it('createDefaultVenue: le message renvoye ne contient pas le texte Postgres', async () => {
    const supabase = createMockSupabase();
    vi.mocked(supabase.from).mockImplementation(
      () =>
        ({
          insert: vi.fn().mockResolvedValue({ error: { message: 'venues_slug_key violated' } }),
        }) as never,
    );
    const err = await createSignupService(supabase)
      .createDefaultVenue('t-1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).message).not.toContain('venues_slug_key');
  });

  it('temoin: sans erreur, les deux ecritures reussissent', async () => {
    const service = createSignupService(createMockSupabase());
    await expect(
      service.createAdminUser({ tenantId: 't-1', userId: 'u-1', email: 'a@b.c', fullName: 'A' }),
    ).resolves.toBeUndefined();
    await expect(service.createDefaultVenue('t-1')).resolves.toBeUndefined();
  });
});
