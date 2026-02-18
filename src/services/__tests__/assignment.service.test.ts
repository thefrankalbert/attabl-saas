import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAssignmentService } from '../assignment.service';
import { ServiceError } from '../errors';

// Mock the logger to avoid Sentry imports in tests
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

/**
 * Helper to build a mock Supabase client with fine-grained control.
 * Each table gets its own chain so we can configure responses per-table.
 */
function createMockSupabase() {
  // Per-table terminal mock holders
  const chains: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};

  function getChain(table: string) {
    if (!chains[table]) {
      chains[table] = {
        single: vi.fn(),
        maybeSingle: vi.fn(),
        update: vi.fn(),
        resolve: vi.fn(), // for chains that resolve directly (e.g. update...is())
      };
    }
    return chains[table];
  }

  const mockFrom = vi.fn((table: string) => {
    const chain = getChain(table);

    // update().eq().eq().is() => resolves   (releaseAllForServer)
    // update().eq().is()     => resolves   (releaseAssignment)
    // update().eq().eq()     => resolves   (claimOrder — awaited directly)
    // second .eq() must be both awaitable (claimOrder) and expose .is() (releaseAllForServer)
    const callResolve = chain.resolve as unknown as () => Promise<unknown>;
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(() => {
          const p = callResolve() as Promise<unknown> & { is: () => Promise<unknown> };
          p.is = callResolve;
          return p;
        }),
        is: chain.resolve,
      }),
    };

    return {
      // select().eq().eq().single()  — used by admin_users lookup
      // select().eq().eq().is().order().limit().maybeSingle() — used by getActiveServerForTable
      // select().eq().is().order() — used by getActiveAssignments (resolves directly)
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: chain.single,
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: chain.maybeSingle,
                }),
              }),
            }),
          }),
          is: vi.fn().mockReturnValue({
            order: chain.resolve,
          }),
        }),
      }),

      // insert().select().single() — used by assignServerToTable
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: chain.single,
        }),
      }),

      // update().eq()... — used by releaseAssignment, releaseAllForServer, claimOrder
      update: vi.fn().mockReturnValue(updateChain),
    };
  });

  return {
    from: mockFrom,
    _chains: chains,
    _getChain: getChain,
  };
}

/** Cast mock to SupabaseClient for the service factory */
function asSupabase(mock: ReturnType<typeof createMockSupabase>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

// ─── Fixtures ──────────────────────────────────────────────

const TENANT_ID = 'tenant-123';
const TABLE_ID = 'table-456';
const SERVER_ID = 'server-789';
const ASSIGNMENT_ID = 'assign-001';
const ORDER_ID = 'order-321';

const mockServer = { id: SERVER_ID, full_name: 'Jean Dupont', role: 'waiter' };
const mockTable = { id: TABLE_ID, display_name: 'Table 4', table_number: '4' };

const mockAssignment = {
  id: ASSIGNMENT_ID,
  tenant_id: TENANT_ID,
  table_id: TABLE_ID,
  server_id: SERVER_ID,
  started_at: '2026-02-18T10:00:00Z',
  ended_at: null,
  created_at: '2026-02-18T10:00:00Z',
  server: mockServer,
  table: mockTable,
};

// ─── Tests ─────────────────────────────────────────────────

describe('AssignmentService', () => {
  describe('assignServerToTable', () => {
    it('should return the assignment on success', async () => {
      const supabase = createMockSupabase();

      // admin_users lookup succeeds
      supabase._getChain('admin_users').single.mockResolvedValue({
        data: { id: SERVER_ID, role: 'waiter' },
        error: null,
      });

      // table_assignments insert succeeds
      supabase._getChain('table_assignments').single.mockResolvedValue({
        data: mockAssignment,
        error: null,
      });

      const service = createAssignmentService(asSupabase(supabase));
      const result = await service.assignServerToTable(TENANT_ID, TABLE_ID, SERVER_ID);

      expect(result).toEqual(mockAssignment);
    });

    it('should throw NOT_FOUND when server does not exist', async () => {
      const supabase = createMockSupabase();

      // admin_users lookup fails
      supabase._getChain('admin_users').single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const service = createAssignmentService(asSupabase(supabase));

      await expect(
        service.assignServerToTable(TENANT_ID, TABLE_ID, SERVER_ID),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        service.assignServerToTable(TENANT_ID, TABLE_ID, SERVER_ID),
      ).rejects.toBeInstanceOf(ServiceError);
    });
  });

  describe('releaseAssignment', () => {
    it('should resolve without error on success', async () => {
      const supabase = createMockSupabase();

      // update().eq().is() => no error
      supabase._getChain('table_assignments').resolve.mockResolvedValue({ error: null });

      const service = createAssignmentService(asSupabase(supabase));

      await expect(service.releaseAssignment(ASSIGNMENT_ID)).resolves.toBeUndefined();
    });
  });

  describe('releaseAllForServer', () => {
    it('should resolve without error on success', async () => {
      const supabase = createMockSupabase();

      // update().eq().eq().is() => no error
      supabase._getChain('table_assignments').resolve.mockResolvedValue({ error: null });

      const service = createAssignmentService(asSupabase(supabase));

      await expect(service.releaseAllForServer(TENANT_ID, SERVER_ID)).resolves.toBeUndefined();
    });
  });

  describe('getActiveServerForTable', () => {
    it('should return the server when an active assignment exists', async () => {
      const supabase = createMockSupabase();

      // select().eq().eq().is().order().limit().maybeSingle()
      supabase._getChain('table_assignments').maybeSingle.mockResolvedValue({
        data: { server: mockServer },
        error: null,
      });

      const service = createAssignmentService(asSupabase(supabase));
      const result = await service.getActiveServerForTable(TENANT_ID, TABLE_ID);

      expect(result).toEqual(mockServer);
    });

    it('should return null when no active assignment exists', async () => {
      const supabase = createMockSupabase();

      supabase._getChain('table_assignments').maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const service = createAssignmentService(asSupabase(supabase));
      const result = await service.getActiveServerForTable(TENANT_ID, TABLE_ID);

      expect(result).toBeNull();
    });
  });

  describe('getActiveAssignments', () => {
    it('should return the list of active assignments', async () => {
      const supabase = createMockSupabase();

      // select().eq().is().order() resolves directly
      supabase._getChain('table_assignments').resolve.mockResolvedValue({
        data: [mockAssignment],
        error: null,
      });

      const service = createAssignmentService(asSupabase(supabase));
      const result = await service.getActiveAssignments(TENANT_ID);

      expect(result).toEqual([mockAssignment]);
    });
  });

  describe('claimOrder', () => {
    it('should resolve without error on success', async () => {
      const supabase = createMockSupabase();

      // update().eq().eq() resolves directly (no .is())
      // The chain for orders uses update().eq().eq() — second eq is the terminal
      supabase._getChain('orders').resolve.mockResolvedValue({ error: null });

      const service = createAssignmentService(asSupabase(supabase));

      await expect(service.claimOrder(ORDER_ID, SERVER_ID, TENANT_ID)).resolves.toBeUndefined();
    });

    it('should throw INTERNAL on database error', async () => {
      const supabase = createMockSupabase();

      supabase._getChain('orders').resolve.mockResolvedValue({
        error: { message: 'DB error' },
      });

      const service = createAssignmentService(asSupabase(supabase));

      await expect(service.claimOrder(ORDER_ID, SERVER_ID, TENANT_ID)).rejects.toMatchObject({
        code: 'INTERNAL',
      });
      await expect(service.claimOrder(ORDER_ID, SERVER_ID, TENANT_ID)).rejects.toBeInstanceOf(
        ServiceError,
      );
    });
  });
});
