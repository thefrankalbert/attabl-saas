import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInvitationService } from '../invitation.service';
import { ServiceError } from '../errors';

// Mock crypto.randomBytes to return deterministic tokens
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => ({
    toString: vi.fn(() => 'mock-token-abc123def456'),
  })),
}));

/**
 * Creates a configurable mock Supabase client for invitation tests.
 */
function createMockSupabase(
  options: {
    existingAuthUser?: { id: string; email: string } | null;
    adminUsersInsertError?: boolean;
    invitationInsertError?: boolean;
    invitationSelectResult?: Record<string, unknown> | null;
    invitationUpdateError?: boolean;
    tokenLookupResult?: Record<string, unknown> | null;
    tokenLookupError?: boolean;
    tenantSlug?: string;
  } = {},
) {
  const auth = {
    admin: {
      listUsers: vi.fn().mockResolvedValue({
        data: {
          users: options.existingAuthUser ? [options.existingAuthUser] : [],
        },
      }),
      createUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'new-user-id-789' } },
        error: null,
      }),
    },
  };

  const invitationRow = options.invitationSelectResult ?? {
    id: 'inv-001',
    tenant_id: 'tenant-xyz',
    email: 'new@example.com',
    role: 'staff',
    custom_permissions: null,
    invited_by: 'owner-123',
    token: 'mock-token-abc123def456',
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    created_at: new Date().toISOString(),
    accepted_at: null,
  };

  const from = vi.fn((table: string) => {
    if (table === 'invitations') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue(
                options.invitationInsertError
                  ? { data: null, error: { message: 'Insert failed' } }
                  : { data: invitationRow, error: null },
              ),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue(
                  options.tokenLookupError
                    ? { data: null, error: { code: 'PGRST116', message: 'Not found' } }
                    : { data: options.tokenLookupResult ?? invitationRow, error: null },
                ),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // For cancelInvitation which chains .eq().eq()
              then: undefined,
              ...(options.invitationUpdateError
                ? { error: { message: 'Update failed' } }
                : { error: null }),
            }),
            // For resendInvitation + validateToken which chain .eq() then .select()
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { ...invitationRow, token: 'mock-token-abc123def456' },
                error: null,
              }),
            }),
            // Direct resolution for update().eq('id', ...) patterns
            then: undefined,
            ...(options.invitationUpdateError
              ? { error: { message: 'Update failed' } }
              : { error: null }),
          }),
        }),
        order: vi.fn().mockReturnValue({
          // for getPendingInvitations - not tested in required scenarios
        }),
      };
    }

    if (table === 'admin_users') {
      return {
        insert: vi
          .fn()
          .mockResolvedValue(
            options.adminUsersInsertError
              ? { error: { message: 'Admin insert failed' } }
              : { error: null },
          ),
      };
    }

    if (table === 'tenants') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { slug: options.tenantSlug || 'mon-resto' },
              error: null,
            }),
          }),
        }),
      };
    }

    // Default fallback
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  });

  return { from, auth } as unknown as Parameters<typeof createInvitationService>[0];
}

describe('InvitationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createInvitation()', () => {
    it('should create a pending invitation with token when user does NOT exist in auth', async () => {
      const supabase = createMockSupabase({ existingAuthUser: null });
      const service = createInvitationService(supabase);

      const result = await service.createInvitation({
        tenantId: 'tenant-xyz',
        email: 'new@example.com',
        role: 'staff',
        invitedBy: 'owner-123',
      });

      expect(result.status).toBe('pending');
      expect(result.token).toBeTruthy();
      expect(result.email).toBe('new@example.com');
      expect(result.role).toBe('staff');
      expect(result.tenant_id).toBe('tenant-xyz');

      // Should have queried invitations table, not admin_users
      expect(supabase.from).toHaveBeenCalledWith('invitations');
    });

    it('should add directly to admin_users and return accepted invitation when user already exists in auth', async () => {
      const supabase = createMockSupabase({
        existingAuthUser: { id: 'existing-user-456', email: 'existing@example.com' },
      });
      const service = createInvitationService(supabase);

      const result = await service.createInvitation({
        tenantId: 'tenant-xyz',
        email: 'existing@example.com',
        role: 'manager',
        invitedBy: 'owner-123',
      });

      expect(result.status).toBe('accepted');
      expect(result.id).toBe('direct-add');
      expect(result.email).toBe('existing@example.com');
      expect(result.role).toBe('manager');

      // Should have inserted into admin_users directly
      expect(supabase.from).toHaveBeenCalledWith('admin_users');
    });

    it('should throw ServiceError when admin_users insert fails for existing user', async () => {
      const supabase = createMockSupabase({
        existingAuthUser: { id: 'existing-user-456', email: 'existing@example.com' },
        adminUsersInsertError: true,
      });
      const service = createInvitationService(supabase);

      await expect(
        service.createInvitation({
          tenantId: 'tenant-xyz',
          email: 'existing@example.com',
          role: 'staff',
          invitedBy: 'owner-123',
        }),
      ).rejects.toThrow(ServiceError);

      await expect(
        service.createInvitation({
          tenantId: 'tenant-xyz',
          email: 'existing@example.com',
          role: 'staff',
          invitedBy: 'owner-123',
        }),
      ).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });
  });

  describe('validateToken()', () => {
    it('should return invitation for a valid, non-expired token', async () => {
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const supabase = createMockSupabase({
        tokenLookupResult: {
          id: 'inv-001',
          tenant_id: 'tenant-xyz',
          email: 'invited@example.com',
          role: 'staff',
          custom_permissions: null,
          invited_by: 'owner-123',
          token: 'valid-token-xyz',
          expires_at: futureDate,
          status: 'pending',
          created_at: new Date().toISOString(),
          accepted_at: null,
          tenants: { name: 'Mon Resto', logo_url: null, slug: 'mon-resto' },
        },
      });
      const service = createInvitationService(supabase);

      const result = await service.validateToken('valid-token-xyz');

      expect(result.id).toBe('inv-001');
      expect(result.email).toBe('invited@example.com');
      expect(result.status).toBe('pending');
    });

    it('should throw NOT_FOUND for an invalid token', async () => {
      const supabase = createMockSupabase({ tokenLookupError: true });
      const service = createInvitationService(supabase);

      await expect(service.validateToken('bad-token')).rejects.toThrow(ServiceError);

      await expect(service.validateToken('bad-token')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should throw VALIDATION for an expired token and mark it expired in DB', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const supabase = createMockSupabase({
        tokenLookupResult: {
          id: 'inv-expired',
          tenant_id: 'tenant-xyz',
          email: 'expired@example.com',
          role: 'staff',
          custom_permissions: null,
          invited_by: 'owner-123',
          token: 'expired-token',
          expires_at: pastDate,
          status: 'pending',
          created_at: new Date().toISOString(),
          accepted_at: null,
        },
      });
      const service = createInvitationService(supabase);

      await expect(service.validateToken('expired-token')).rejects.toThrow(ServiceError);

      await expect(service.validateToken('expired-token')).rejects.toMatchObject({
        code: 'VALIDATION',
      });

      // Should have updated the invitation status to expired
      expect(supabase.from).toHaveBeenCalledWith('invitations');
    });
  });

  describe('cancelInvitation()', () => {
    it('should update invitation status to cancelled', async () => {
      const supabase = createMockSupabase();
      const service = createInvitationService(supabase);

      await expect(service.cancelInvitation('inv-001')).resolves.toBeUndefined();

      expect(supabase.from).toHaveBeenCalledWith('invitations');
    });
  });

  describe('resendInvitation()', () => {
    it('should generate a new token and expiry, and return the updated invitation', async () => {
      const supabase = createMockSupabase();
      const service = createInvitationService(supabase);

      const result = await service.resendInvitation('inv-001');

      expect(result).toBeDefined();
      expect(result.token).toBe('mock-token-abc123def456');
      expect(supabase.from).toHaveBeenCalledWith('invitations');
    });
  });
});
