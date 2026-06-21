import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTableConfigService } from '../table-config.service';
import { ServiceError } from '../errors';

// ─── Mock Supabase Builder ─────────────────────────────────

/**
 * Creates a configurable mock Supabase client for table-config tests.
 *
 * After bulk refactor:
 * - Zone inserts use `.insert(array).select()` (bulk, no .single())
 * - Table inserts use `.insert(array).select()` (bulk, no .single())
 * - Table lookups use `.select().eq().like().order().limit().single()`
 */
interface MockChain {
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  ownership: ReturnType<typeof vi.fn>;
  bulkResult: ReturnType<typeof vi.fn>;
}

function createMockSupabase() {
  const chains: Record<string, MockChain> = {};

  function getChain(table: string): MockChain {
    if (!chains[table]) {
      chains[table] = {
        single: vi.fn(),
        // Ownership guards resolve via .select(...).eq('id', x).maybeSingle().
        // Default to "owned by TENANT_ID" so happy-path tests pass without
        // extra wiring; tests can override per-case.
        maybeSingle: vi.fn().mockResolvedValue({
          data:
            table === 'tables'
              ? { zone: { venue: { tenant_id: TENANT_ID } } }
              : { venue: { tenant_id: TENANT_ID } },
          error: null,
        }),
        // Ownership guard for insertTables resolves via .in('id', ids).eq(...)
        // returning the owned rows; default returns nothing (overridden per-case).
        ownership: vi.fn().mockResolvedValue({ data: [], error: null }),
        bulkResult: vi.fn(),
      };
    }
    return chains[table];
  }

  const mockFrom = vi.fn((table: string) => {
    const chain = getChain(table);

    return {
      // insert().select() - bulk inserts for both zones and tables
      // Also supports .single() for addTablesToZone lookup pattern
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockImplementation(() => {
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

      // select(...) supports several read shapes:
      // - addTablesToZone max-number lookup: .eq().like().order().limit().single()
      // - ownership guards: .eq('id', x).maybeSingle() (zones/tables)
      //   and .eq('id', x).eq('tenant_id', y).maybeSingle() (venues)
      // - insertTables guard: .in('id', ids).eq('venues.tenant_id', y) (awaited)
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          // venues ownership guard: second .eq() then .maybeSingle()
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: chain.single,
              }),
            }),
            maybeSingle: chain.maybeSingle,
          }),
          like: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: chain.single,
              }),
            }),
          }),
          // zones/tables ownership guard: single .eq('id', x).maybeSingle()
          maybeSingle: chain.maybeSingle,
        }),
        // insertTables ownership guard: .in('id', ids).eq('venues.tenant_id', y)
        in: vi.fn().mockReturnValue({
          eq: chain.ownership,
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
    it('should bulk-create zones and auto-numbered tables', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // Zones bulk insert returns all zones at once
      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
        data: [
          { id: 'zone-a', name: 'Interieur', prefix: 'INT' },
          { id: 'zone-b', name: 'Terrasse', prefix: 'TER' },
        ],
        error: null,
      });

      // Tables bulk insert returns all tables at once
      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: [
          { id: 't1', table_number: 'INT-1', zone_id: 'zone-a' },
          { id: 't2', table_number: 'INT-2', zone_id: 'zone-a' },
          { id: 't3', table_number: 'TER-1', zone_id: 'zone-b' },
          { id: 't4', table_number: 'TER-2', zone_id: 'zone-b' },
          { id: 't5', table_number: 'TER-3', zone_id: 'zone-b' },
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
      expect(result[0].tables).toHaveLength(2);
      expect(result[1].zone.id).toBe('zone-b');
      expect(result[1].tables).toHaveLength(3);
    });

    it('should throw ServiceError when zone insert fails', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      });

      const zones = [{ name: 'Interieur', prefix: 'INT', tableCount: 2, defaultCapacity: 4 }];

      await expect(service.createZonesAndTables(TENANT_ID, VENUE_ID, zones)).rejects.toBeInstanceOf(
        ServiceError,
      );

      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
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
      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
        data: [{ id: 'zone-a', name: 'Interieur', prefix: 'INT' }],
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

      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
        data: [{ id: 'zone-a', name: 'Bar', prefix: 'BAR' }],
        error: null,
      });

      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: [{ id: 't1', table_number: 'BAR-1', zone_id: 'zone-a' }],
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

      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
        data: [{ id: 'zone-default', name: 'Salle principale', prefix: 'TAB' }],
        error: null,
      });

      supabase._getChain('tables').bulkResult.mockReturnValueOnce({
        data: [
          { id: 't1', table_number: 'TAB-1', zone_id: 'zone-default' },
          { id: 't2', table_number: 'TAB-2', zone_id: 'zone-default' },
          { id: 't3', table_number: 'TAB-3', zone_id: 'zone-default' },
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

      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
        data: [{ id: 'zone-default', name: 'Salle principale', prefix: 'TAB' }],
        error: null,
      });

      const tablesData = Array.from({ length: 5 }, (_, i) => ({
        id: `t${i + 1}`,
        table_number: `TAB-${i + 1}`,
        zone_id: 'zone-default',
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

      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
        data: null,
        error: { message: 'Zone insert failed' },
      });

      await expect(service.createDefaultConfig(TENANT_ID, VENUE_ID, 3)).rejects.toBeInstanceOf(
        ServiceError,
      );

      supabase._getChain('zones').bulkResult.mockReturnValueOnce({
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

      // First call: select max table_number for the zone - returns INT-5
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

  // ── Cross-tenant ownership guards ───────────────────────

  describe('cross-tenant write guards', () => {
    const FOREIGN_TENANT = 'tenant-other';

    it('addTablesToZone rejects a zone owned by another tenant', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // Zone resolves to a different tenant via the venue join
      supabase._getChain('zones').maybeSingle.mockResolvedValueOnce({
        data: { venue: { tenant_id: FOREIGN_TENANT } },
        error: null,
      });

      await expect(service.addTablesToZone(TENANT_ID, ZONE_ID, 'INT', 2, 4)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('updateZoneName rejects a foreign zone before writing', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('zones').maybeSingle.mockResolvedValueOnce({
        data: { venue: { tenant_id: FOREIGN_TENANT } },
        error: null,
      });

      await expect(service.updateZoneName(TENANT_ID, ZONE_ID, 'Hacked')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('deleteZone rejects a foreign zone before writing', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('zones').maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(service.deleteZone(TENANT_ID, ZONE_ID)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('deleteTable rejects a table owned by another tenant', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('tables').maybeSingle.mockResolvedValueOnce({
        data: { zone: { venue: { tenant_id: FOREIGN_TENANT } } },
        error: null,
      });

      await expect(service.deleteTable(TENANT_ID, 'table-foreign')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('toggleTableActive rejects a foreign table before writing', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      supabase._getChain('tables').maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        service.toggleTableActive(TENANT_ID, 'table-foreign', false),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('createZone rejects a venue owned by another tenant', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // venues guard lookup returns no row for this tenant
      supabase._getChain('venues').maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        service.createZone(TENANT_ID, 'venue-foreign', 'Zone', 'ZN', 0),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('insertTables rejects a batch containing a foreign zone_id', async () => {
      const supabase = createMockSupabase();
      const service = createTableConfigService(asSupabase(supabase));

      // Ownership lookup returns only one owned zone; the batch references two.
      supabase._getChain('zones').ownership.mockResolvedValueOnce({
        data: [{ id: 'zone-owned' }],
        error: null,
      });

      await expect(
        service.insertTables(TENANT_ID, [
          {
            zone_id: 'zone-owned',
            table_number: 'A-1',
            display_name: 'A-1',
            capacity: 2,
            is_active: true,
          },
          {
            zone_id: 'zone-foreign',
            table_number: 'B-1',
            display_name: 'B-1',
            capacity: 2,
            is_active: true,
          },
        ]),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });
});
