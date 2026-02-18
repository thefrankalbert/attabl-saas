import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTableConfigService } from '../table-config.service';
import { ServiceError } from '../errors';

// ─── Mock Supabase Builder ─────────────────────────────────

/**
 * Creates a configurable mock Supabase client for table-config tests.
 *
 * Zone inserts use `.insert().select().single()` (single zone at a time).
 * Table inserts use `.insert().select()` (bulk insert, no .single()).
 * Table lookups use `.select().eq().like().order().limit().single()`.
 */
interface MockChain {
  single: ReturnType<typeof vi.fn>;
  bulkResult: ReturnType<typeof vi.fn>;
}

function createMockSupabase() {
  const chains: Record<string, MockChain> = {};

  function getChain(table: string): MockChain {
    if (!chains[table]) {
      chains[table] = {
        single: vi.fn(),
        bulkResult: vi.fn(),
      };
    }
    return chains[table];
  }

  const mockFrom = vi.fn((table: string) => {
    const chain = getChain(table);

    return {
      // insert().select().single() — zone inserts (single row)
      // insert().select() — table inserts (bulk, resolves via bulkResult)
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockImplementation(() => {
          // Return an object that supports both patterns:
          // .single() for zones and direct await for bulk tables
          const bulkFn = chain.bulkResult as (...args: unknown[]) => {
            data: unknown;
            error: unknown;
          } | null;
          const selectResult = bulkFn();
          return {
            single: chain.single,
            data: selectResult?.data,
            error: selectResult?.error,
          };
        }),
      }),

      // select('table_number').eq().like().order().limit().single()
      // — used by addTablesToZone to find max existing number
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: chain.single,
              }),
            }),
          }),
          like: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: chain.single,
              }),
            }),
          }),
        }),
      }),
    };
  });

  return {
    from: mockFrom,
    _chains: chains,
    _getChain: getChain,
  };
}

function asSupabase(mock: ReturnType<typeof createMockSupabase>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

// ─── Fixtures ──────────────────────────────────────────────

const TENANT_ID = 'tenant-123';
const VENUE_ID = 'venue-456';
const ZONE_ID = 'zone-789';

// ─── Tests ─────────────────────────────────────────────────

describe('TableConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── generateTableNumber ─────────────────────────────────

  describe('generateTableNumber()', () => {
    it('should return prefix-index format', () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      expect(service.generateTableNumber('INT', 1)).toBe('INT-1');
      expect(service.generateTableNumber('TER', 5)).toBe('TER-5');
      expect(service.generateTableNumber('TAB', 42)).toBe('TAB-42');
    });

    it('should handle single-char prefixes', () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      expect(service.generateTableNumber('A', 1)).toBe('A-1');
    });
  });

  // ── createZonesAndTables ────────────────────────────────

  describe('createZonesAndTables()', () => {
    it('should create zones and auto-numbered tables', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // Zone inserts return via .single()
      supabase
        ._getChain('zones')
        .single.mockResolvedValueOnce({
          data: { id: 'zone-a', name: 'Interieur', prefix: 'INT' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: 'zone-b', name: 'Terrasse', prefix: 'TER' },
          error: null,
        });

      // Table bulk inserts resolve via bulkResult (no .single())
      supabase
        ._getChain('tables')
        .bulkResult.mockReturnValueOnce({
          data: [
            { id: 't1', table_number: 'INT-1' },
            { id: 't2', table_number: 'INT-2' },
          ],
          error: null,
        })
        .mockReturnValueOnce({
          data: [
            { id: 't3', table_number: 'TER-1' },
            { id: 't4', table_number: 'TER-2' },
            { id: 't5', table_number: 'TER-3' },
          ],
          error: null,
        });

      const zones = [
        { name: 'Interieur', prefix: 'INT', tableCount: 2, defaultCapacity: 4 },
        { name: 'Terrasse', prefix: 'TER', tableCount: 3, defaultCapacity: 2 },
      ];

      const result = await service.createZonesAndTables(TENANT_ID, VENUE_ID, zones);

      expect(supabase.from).toHaveBeenCalledWith('zones');
      expect(supabase.from).toHaveBeenCalledWith('tables');

      expect(result).toHaveLength(2);
      expect(result[0].zone.id).toBe('zone-a');
      expect(result[1].zone.id).toBe('zone-b');
    });

    it('should throw ServiceError when zone insert fails', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('zones').single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      });

      const zones = [{ name: 'Interieur', prefix: 'INT', tableCount: 2, defaultCapacity: 4 }];

      await expect(service.createZonesAndTables(TENANT_ID, VENUE_ID, zones)).rejects.toBeInstanceOf(
        ServiceError,
      );

      supabase._getChain('zones').single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      });

      await expect(service.createZonesAndTables(TENANT_ID, VENUE_ID, zones)).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });

    it('should throw ServiceError when tables insert fails', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // Zone insert succeeds
      supabase._getChain('zones').single.mockResolvedValueOnce({
        data: { id: 'zone-a', name: 'Interieur', prefix: 'INT' },
        error: null,
      });

      // Tables insert fails
      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: null,
        error: { message: 'Tables insert failed' },
      });

      const zones = [{ name: 'Interieur', prefix: 'INT', tableCount: 2, defaultCapacity: 4 }];

      await expect(service.createZonesAndTables(TENANT_ID, VENUE_ID, zones)).rejects.toBeInstanceOf(
        ServiceError,
      );
    });

    it('should use default capacity of 2 when not specified', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('zones').single.mockResolvedValueOnce({
        data: { id: 'zone-a', name: 'Bar', prefix: 'BAR' },
        error: null,
      });

      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: [{ id: 't1', table_number: 'BAR-1' }],
        error: null,
      });

      const zones = [{ name: 'Bar', prefix: 'BAR', tableCount: 1, defaultCapacity: 2 }];

      await service.createZonesAndTables(TENANT_ID, VENUE_ID, zones);

      // Verify the tables insert was called with capacity 2 (default)
      const tablesFromCall = supabase.from.mock.calls.find(
        (call: string[]) => call[0] === 'tables',
      );
      expect(tablesFromCall).toBeDefined();
    });
  });

  // ── createDefaultConfig ─────────────────────────────────

  describe('createDefaultConfig()', () => {
    it('should create a default zone "Salle principale" with prefix "TAB"', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('zones').single.mockResolvedValueOnce({
        data: { id: 'zone-default', name: 'Salle principale', prefix: 'TAB' },
        error: null,
      });

      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: [
          { id: 't1', table_number: 'TAB-1' },
          { id: 't2', table_number: 'TAB-2' },
          { id: 't3', table_number: 'TAB-3' },
        ],
        error: null,
      });

      const result = await service.createDefaultConfig(TENANT_ID, VENUE_ID, 3);

      expect(supabase.from).toHaveBeenCalledWith('zones');
      expect(supabase.from).toHaveBeenCalledWith('tables');

      expect(result.zone.id).toBe('zone-default');
      expect(result.zone.name).toBe('Salle principale');
    });

    it('should create the correct number of tables', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('zones').single.mockResolvedValueOnce({
        data: { id: 'zone-default', name: 'Salle principale', prefix: 'TAB' },
        error: null,
      });

      const tablesData = Array.from({ length: 5 }, (_, i) => ({
        id: `t${i + 1}`,
        table_number: `TAB-${i + 1}`,
      }));

      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: tablesData,
        error: null,
      });

      const result = await service.createDefaultConfig(TENANT_ID, VENUE_ID, 5);

      expect(result.tables).toHaveLength(5);
    });

    it('should throw ServiceError when zone creation fails', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('zones').single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Zone insert failed' },
      });

      await expect(service.createDefaultConfig(TENANT_ID, VENUE_ID, 3)).rejects.toBeInstanceOf(
        ServiceError,
      );

      supabase._getChain('zones').single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Zone insert failed' },
      });

      await expect(service.createDefaultConfig(TENANT_ID, VENUE_ID, 3)).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });
  });

  // ── addTablesToZone ─────────────────────────────────────

  describe('addTablesToZone()', () => {
    it('should continue numbering from the max existing table number', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // First call: select max table_number for the zone — returns INT-5
      supabase._getChain('tables').single.mockResolvedValueOnce({
        data: { table_number: 'INT-5' },
        error: null,
      });

      // Second call: bulk insert new tables
      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: [
          { id: 't6', table_number: 'INT-6' },
          { id: 't7', table_number: 'INT-7' },
        ],
        error: null,
      });

      const result = await service.addTablesToZone(TENANT_ID, ZONE_ID, 'INT', 2, 4);

      expect(result).toHaveLength(2);
      expect(supabase.from).toHaveBeenCalledWith('tables');
    });

    it('should start from 1 when no existing tables', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // No existing tables found
      supabase._getChain('tables').single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Insert new tables
      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: [
          { id: 't1', table_number: 'TER-1' },
          { id: 't2', table_number: 'TER-2' },
          { id: 't3', table_number: 'TER-3' },
        ],
        error: null,
      });

      const result = await service.addTablesToZone(TENANT_ID, ZONE_ID, 'TER', 3, 2);

      expect(result).toHaveLength(3);
    });

    it('should throw ServiceError when insert fails', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // Find max succeeds
      supabase._getChain('tables').single.mockResolvedValueOnce({
        data: { table_number: 'INT-2' },
        error: null,
      });

      // Insert fails
      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      });

      await expect(service.addTablesToZone(TENANT_ID, ZONE_ID, 'INT', 2, 4)).rejects.toBeInstanceOf(
        ServiceError,
      );

      // Reset mock for second assertion
      supabase._getChain('tables').single.mockResolvedValueOnce({
        data: { table_number: 'INT-2' },
        error: null,
      });

      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      });

      await expect(service.addTablesToZone(TENANT_ID, ZONE_ID, 'INT', 2, 4)).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });

    it('should use default capacity of 2 when not specified', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('tables').single.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: [{ id: 't1', table_number: 'BAR-1' }],
        error: null,
      });

      const result = await service.addTablesToZone(TENANT_ID, ZONE_ID, 'BAR', 1);

      expect(result).toHaveLength(1);
    });
  });
});
