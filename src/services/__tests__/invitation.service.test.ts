import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffPoste } from '@/types/permission.types';
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
    invitationInsertError?: boolean | { code: string; message: string };
    pendingReadError?: { code: string; message: string };
    invitationSelectResult?: Record<string, unknown> | null;
    existingPendingInvitation?: Record<string, unknown> | null;
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
    postes: ['waiter'],
    permission_overrides: null,
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
            single: vi.fn().mockResolvedValue(
              options.invitationInsertError
                ? {
                    data: null,
                    error:
                      typeof options.invitationInsertError === 'object'
                        ? options.invitationInsertError
                        : { message: 'Insert failed' },
                  }
                : { data: invitationRow, error: null },
            ),
          }),
        }),
        // Self-chaining select: supports validateToken (eq.eq.single) AND the
        // duplicate-pending guard (eq.eq.eq.maybeSingle) on the same table.
        select: vi.fn(() => {
          const selChain: Record<string, unknown> = {};
          selChain.eq = vi.fn(() => selChain);
          selChain.limit = vi.fn(() => selChain);
          selChain.single = vi
            .fn()
            .mockResolvedValue(
              options.tokenLookupError
                ? { data: null, error: { code: 'PGRST116', message: 'Not found' } }
                : { data: options.tokenLookupResult ?? invitationRow, error: null },
            );
          selChain.maybeSingle = vi.fn().mockResolvedValue({
            data: options.existingPendingInvitation ?? null,
            error: options.pendingReadError ?? null,
          });
          return selChain;
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // For cancelInvitation which chains .eq().eq()
              // For resendInvitation which chains .eq().eq('status','pending').select()
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { ...invitationRow, token: 'mock-token-abc123def456' },
                  error: null,
                }),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { ...invitationRow, token: 'mock-token-abc123def456' },
                  error: null,
                }),
              }),
              // createInvitation: expiration des invitations perimees
              // (.eq tenant .eq email .eq status .lt expires_at).
              eq: vi.fn(() => ({ lt: vi.fn().mockResolvedValue({ error: null, count: 0 }) })),
              then: undefined,
              count: 1,
              ...(options.invitationUpdateError
                ? { error: { message: 'Update failed' } }
                : { error: null }),
            }),
            // For validateToken which chains .eq() then .select()
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
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: options.existingAuthUser
                ? { user_id: options.existingAuthUser.id, email: options.existingAuthUser.email }
                : null,
              error: null,
            }),
          }),
        }),
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
        postes: ['waiter'],
        invitedBy: 'owner-123',
      });

      expect(result.status).toBe('pending');
      expect(result.token).toBeTruthy();
      expect(result.email).toBe('new@example.com');
      expect(result.postes).toEqual(['waiter']);
      expect(result.tenant_id).toBe('tenant-xyz');

      // Should have queried invitations table, not admin_users
      expect(supabase.from).toHaveBeenCalledWith('invitations');
    });

    it('should reject a duplicate pending invitation for the same tenant+email', async () => {
      const supabase = createMockSupabase({
        existingAuthUser: null,
        existingPendingInvitation: { id: 'inv-existing' },
      });
      const service = createInvitationService(supabase);

      await expect(
        service.createInvitation({
          tenantId: 'tenant-xyz',
          email: 'new@example.com',
          postes: ['waiter'],
          invitedBy: 'owner-123',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('B53: le doublon tranche par l index unique (23505) donne le meme refus', async () => {
      const supabase = createMockSupabase({
        invitationInsertError: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "invitations_pending_email_unique"',
        },
      });
      const err = await createInvitationService(supabase)
        .createInvitation({
          tenantId: 'tenant-xyz',
          email: 'new@example.com',
          postes: ['waiter'],
          invitedBy: 'owner-123',
        })
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'VALIDATION' });
      expect((err as ServiceError).message).toContain('deja en attente');
    });

    it('B53: une erreur de lecture du garde est une panne, pas un feu vert', async () => {
      const supabase = createMockSupabase({
        pendingReadError: { code: 'PGRST116', message: 'multiple rows' },
      });
      await expect(
        createInvitationService(supabase).createInvitation({
          tenantId: 'tenant-xyz',
          email: 'new@example.com',
          postes: ['waiter'],
          invitedBy: 'owner-123',
        }),
      ).rejects.toMatchObject({ code: 'INTERNAL' });
    });

    it('B66: une autre erreur d insertion ne renvoie pas le message Postgres', async () => {
      const supabase = createMockSupabase({
        invitationInsertError: { code: '23503', message: 'insert violates foreign key "x_fkey"' },
      });
      const err = await createInvitationService(supabase)
        .createInvitation({
          tenantId: 'tenant-xyz',
          email: 'new@example.com',
          postes: ['waiter'],
          invitedBy: 'owner-123',
        })
        .catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'INTERNAL' });
      expect((err as ServiceError).message).not.toContain('fkey');
    });

    // SECURITE (constat SVC-12): un compte qui existe deja ne doit JAMAIS etre
    // ajoute directement dans admin_users. Cet ajout sans jeton ni consentement
    // du titulaire etait la premiere marche de la prise de controle de compte:
    // l'invitant obtenait une ligne admin_users sur le compte d'un tiers, puis
    // s'en servait pour reinitialiser son mot de passe ou changer son email.
    // Le titulaire doit recevoir une invitation a accepter lui-meme.
    it('ne doit PAS ajouter directement dans admin_users quand le compte existe deja', async () => {
      const supabase = createMockSupabase({
        existingAuthUser: { id: 'existing-user-456', email: 'existing@example.com' },
      });
      const service = createInvitationService(supabase);

      const result = await service.createInvitation({
        tenantId: 'tenant-xyz',
        email: 'existing@example.com',
        postes: ['manager'],
        invitedBy: 'owner-123',
      });

      // Une invitation en attente, avec jeton: le titulaire devra l'accepter.
      expect(result.status).toBe('pending');
      expect(result.token).toBeTruthy();
      expect(result.id).not.toBe('direct-add');

      // Aucune ecriture dans admin_users.
      const adminUsersCalls = (
        supabase.from as unknown as ReturnType<typeof vi.fn>
      ).mock.calls.filter((call: unknown[]) => call[0] === 'admin_users');
      expect(adminUsersCalls).toHaveLength(0);
    });

    it("ne doit pas permettre d'enumerer les comptes: meme reponse pour un email connu et inconnu", async () => {
      const serviceKnown = createInvitationService(
        createMockSupabase({
          existingAuthUser: { id: 'existing-user-456', email: 'existing@example.com' },
        }),
      );
      const serviceUnknown = createInvitationService(
        createMockSupabase({ existingAuthUser: null }),
      );

      const known = await serviceKnown.createInvitation({
        tenantId: 'tenant-xyz',
        email: 'existing@example.com',
        postes: ['waiter'],
        invitedBy: 'owner-123',
      });
      const unknown = await serviceUnknown.createInvitation({
        tenantId: 'tenant-xyz',
        email: 'new@example.com',
        postes: ['waiter'],
        invitedBy: 'owner-123',
      });

      expect(known.status).toBe(unknown.status);
      expect(known.id).toBe(unknown.id);
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
          postes: ['waiter'],
          permission_overrides: null,
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
          postes: ['waiter'],
          permission_overrides: null,
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

  // Revue L021/L022 (A22, A23): une invitation qui n'est plus en attente.
  describe('invitation qui n est plus en attente', () => {
    function updateReturning(result: Record<string, unknown>) {
      const chain: Record<string, unknown> = {};
      chain.eq = vi.fn(() => chain);
      chain.select = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => result);
      chain.then = (ok: (v: unknown) => unknown) => ok(result);
      return {
        from: vi.fn(() => ({ update: vi.fn(() => chain) })),
      } as unknown as Parameters<typeof createInvitationService>[0];
    }

    it('annuler une invitation deja acceptee: CONFLICT, pas de faux succes', async () => {
      const service = createInvitationService(updateReturning({ error: null, count: 0 }));
      await expect(service.cancelInvitation('inv-001')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('renvoyer une invitation deja acceptee: CONFLICT sans texte PostgREST', async () => {
      const service = createInvitationService(updateReturning({ data: null, error: null }));
      const err = await service.resendInvitation('inv-001').catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'CONFLICT' });
      expect((err as Error).message).not.toMatch(/JSON object requested|rows returned/);
    });

    it('erreur de base au renvoi: INTERNAL, message sans le texte brut', async () => {
      const service = createInvitationService(
        updateReturning({ data: null, error: { message: 'JSON object requested, multiple' } }),
      );
      const err = await service.resendInvitation('inv-001').catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'INTERNAL' });
      expect((err as Error).message).not.toMatch(/JSON object requested/);
    });
  });
});

/**
 * B53 (retouche): une invitation `pending` perimee ne doit pas bloquer une
 * nouvelle invitation a la meme adresse. Fausse base a etat: l'UPDATE applique
 * ses filtres, la lecture anti-doublon voit le resultat.
 */
describe('createInvitation: invitation perimee restee pending (B53)', () => {
  type Row = { id: string; tenant_id: string; email: string; status: string; expires_at: string };

  function statefulClient(rows: Row[]) {
    const updateFilters: [string, string, unknown][] = [];
    const from = () => {
      const filters: [string, string, unknown][] = [];
      const matches = (r: Row) =>
        filters.every(([op, col, val]) => {
          const cell = (r as Record<string, string>)[col];
          return op === 'eq' ? cell === val : cell < (val as string);
        });
      let patch: Partial<Row> | null = null;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.limit = () => chain;
      chain.eq = (col: string, val: unknown) => (filters.push(['eq', col, val]), chain);
      chain.lt = (col: string, val: unknown) => (filters.push(['lt', col, val]), chain);
      chain.update = (p: Partial<Row>) => ((patch = p), chain);
      chain.then = (ok: (v: unknown) => unknown) => {
        const hit = rows.filter(matches);
        if (patch) {
          updateFilters.push(...filters);
          hit.forEach((r) => Object.assign(r, patch));
        }
        return Promise.resolve({ error: null, count: hit.length }).then(ok);
      };
      chain.maybeSingle = async () => ({ data: rows.filter(matches)[0] ?? null, error: null });
      chain.insert = (payload: Row) => ({
        select: () => ({
          single: async () => {
            rows.push({ ...payload, id: 'inv-nouvelle' });
            return { data: { ...payload, id: 'inv-nouvelle', token: 't' }, error: null };
          },
        }),
      });
      return chain;
    };
    return {
      client: { from } as unknown as Parameters<typeof createInvitationService>[0],
      updateFilters,
    };
  }

  const input = {
    tenantId: 'tenant-xyz',
    email: 'serveur@example.com',
    postes: ['waiter'] as StaffPoste[],
    invitedBy: 'owner-123',
  };
  const row = (expiresAt: string): Row => ({
    id: 'inv-ancienne',
    tenant_id: 'tenant-xyz',
    email: 'serveur@example.com',
    status: 'pending',
    expires_at: expiresAt,
  });

  it('insere les postes cumules et le reglage par personne, sans colonne role', async () => {
    const rows: Row[] = [];
    const { client } = statefulClient(rows);

    await createInvitationService(client).createInvitation({
      ...input,
      postes: ['manager', 'cashier'],
      permissionOverrides: { 'billing.manage': true },
    });

    expect(rows[0]).toMatchObject({
      postes: ['manager', 'cashier'],
      permission_overrides: { 'billing.manage': true },
    });
    expect(rows[0]).not.toHaveProperty('role');
  });

  it('l invitation perimee passe a expired, la nouvelle est creee', async () => {
    const rows = [row('2020-01-01T00:00:00.000Z')];
    const { client, updateFilters } = statefulClient(rows);

    const created = await createInvitationService(client).createInvitation(input);

    expect(created.id).toBe('inv-nouvelle');
    expect(rows[0].status).toBe('expired');
    expect(updateFilters).toContainEqual(['eq', 'tenant_id', 'tenant-xyz']);
  });

  it('temoin: une invitation encore valide reste en attente, la nouvelle est refusee', async () => {
    const rows = [row('2999-01-01T00:00:00.000Z')];
    const { client } = statefulClient(rows);

    await expect(createInvitationService(client).createInvitation(input)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(rows[0].status).toBe('pending');
    expect(rows).toHaveLength(1);
  });

  it('temoin: l invitation perimee d un AUTRE restaurant n est pas touchee', async () => {
    const rows = [{ ...row('2020-01-01T00:00:00.000Z'), tenant_id: 'autre-resto' }];
    const { client } = statefulClient(rows);

    await createInvitationService(client).createInvitation(input);

    expect(rows[0].status).toBe('pending');
  });
});
