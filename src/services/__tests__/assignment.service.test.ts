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
        update: vi.fn(),
        resolve: vi.fn(), // for chains that resolve directly (e.g. update...is())
      };
    }
    return chains[table];
  }

  const mockFrom = vi.fn((table: string) => {
    const chain = getChain(table);

    // update().eq().eq().is() => resolves          (releaseAllForServer, releaseAssignment)
    // update().eq().eq().or().select() => resolves (claimOrder - first-claim-wins)
    // second .eq() must expose .is() (releaseAllForServer) AND .or().select() (claimOrder)
    const callResolve = chain.resolve as unknown as () => Promise<unknown>;
    const updateChain = {
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation(() => {
          const p = callResolve() as Promise<unknown> & {
            is: () => Promise<unknown>;
            or: () => Promise<unknown>;
          };
          p.is = callResolve;
          // B9: claimOrder filtre aussi le statut avant `.or()`.
          Object.assign(p, { neq: () => p, in: () => p });
          // claimOrder awaits `.or()` directly with `{ count: 'exact' }`: no
          // `.select()` (PostgREST rejects or + returning rows with 42703).
          p.or = callResolve;
          return p;
        }),
        is: chain.resolve,
      }),
    };

    return {
      // select().eq().eq().single()  - used by admin_users lookup
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: chain.single,
          }),
        }),
      }),

      // insert().select().single() - used by assignServerToTable
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: chain.single,
        }),
      }),

      // update().eq()... - used by releaseAssignment, releaseAllForServer, claimOrder
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

// --- Fixtures ----------------------------------------------

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

// --- Tests -------------------------------------------------

describe('AssignmentService', () => {
  describe('assignServerToTable', () => {
    it('should return the assignment on success', async () => {
      const supabase = createMockSupabase();

      // admin_users lookup succeeds
      supabase._getChain('admin_users').single.mockResolvedValue({
        data: { id: SERVER_ID, role: 'waiter' },
        error: null,
      });

      // tables lookup succeeds (table belongs to the tenant)
      supabase._getChain('tables').single.mockResolvedValue({
        data: { id: TABLE_ID },
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

    it('should throw NOT_FOUND when the table belongs to another tenant', async () => {
      const supabase = createMockSupabase();

      // server exists in this tenant...
      supabase._getChain('admin_users').single.mockResolvedValue({
        data: { id: SERVER_ID, role: 'waiter' },
        error: null,
      });
      // ...but the table does not (cross-tenant table_id).
      supabase._getChain('tables').single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      });

      const service = createAssignmentService(asSupabase(supabase));

      await expect(
        service.assignServerToTable(TENANT_ID, TABLE_ID, SERVER_ID),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
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

      await expect(service.releaseAssignment(ASSIGNMENT_ID, TENANT_ID)).resolves.toBeUndefined();
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

  describe('claimOrder', () => {
    it('should resolve without error when a row is claimed', async () => {
      const supabase = createMockSupabase();

      // update(..., { count }).eq().eq().or() reports one row updated
      supabase._getChain('orders').resolve.mockResolvedValue({ count: 1, error: null });

      const service = createAssignmentService(asSupabase(supabase));

      await expect(service.claimOrder(ORDER_ID, SERVER_ID, TENANT_ID)).resolves.toBeUndefined();
    });

    it('should throw CONFLICT when the order is already claimed by another server', async () => {
      const supabase = createMockSupabase();

      // No row matched the (server_id IS NULL OR server_id = me) guard -> already taken
      supabase._getChain('orders').resolve.mockResolvedValue({ count: 0, error: null });

      const service = createAssignmentService(asSupabase(supabase));

      await expect(service.claimOrder(ORDER_ID, SERVER_ID, TENANT_ID)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('should throw INTERNAL on database error', async () => {
      const supabase = createMockSupabase();

      supabase._getChain('orders').resolve.mockResolvedValue({
        data: null,
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

describe('assignIfFree (waiter takes the table of the order they send)', () => {
  /** table_assignments read answers `read`; the filters it received are recorded. */
  function clientReading(read: { data: unknown; error: unknown }) {
    const filters: [string, unknown][] = [];
    const chain = {
      select: () => chain,
      eq: (c: string, v: unknown) => (filters.push([c, v]), chain),
      is: (c: string, v: unknown) => (filters.push([c, v]), chain),
      limit: () => chain,
      maybeSingle: async () => read,
    };
    return { client: { from: () => chain } as unknown as SupabaseClient, filters };
  }

  it('assigns the waiter when the table has no active server', async () => {
    const { client, filters } = clientReading({ data: null, error: null });
    const svc = createAssignmentService(client);
    const assign = vi.spyOn(svc, 'assignServerToTable').mockResolvedValue({} as never);
    await expect(svc.assignIfFree('t1', 'table-5', 'waiter-1')).resolves.toBe(true);
    expect(assign).toHaveBeenCalledWith('t1', 'table-5', 'waiter-1');
    expect(filters).toEqual([
      ['tenant_id', 't1'],
      ['table_id', 'table-5'],
      ['ended_at', null],
    ]);
  });

  it('leaves a table that already has a server untouched', async () => {
    const { client } = clientReading({ data: { id: 'a-1' }, error: null });
    const svc = createAssignmentService(client);
    const assign = vi.spyOn(svc, 'assignServerToTable').mockResolvedValue({} as never);
    await expect(svc.assignIfFree('t1', 'table-5', 'waiter-1')).resolves.toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it('a failed read is NOT a free table: no second server stacked', async () => {
    const { client } = clientReading({ data: null, error: { message: 'timeout' } });
    const svc = createAssignmentService(client);
    const assign = vi.spyOn(svc, 'assignServerToTable').mockResolvedValue({} as never);
    await expect(svc.assignIfFree('t1', 'table-5', 'waiter-1')).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('propagates an assignment failure so the caller can log it', async () => {
    const { client } = clientReading({ data: null, error: null });
    const svc = createAssignmentService(client);
    vi.spyOn(svc, 'assignServerToTable').mockRejectedValue(
      new ServiceError('Table introuvable', 'NOT_FOUND'),
    );
    await expect(svc.assignIfFree('t1', 'gone', 'waiter-1')).rejects.toBeInstanceOf(ServiceError);
  });
});
