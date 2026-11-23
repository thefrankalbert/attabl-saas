import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createQrDesignService } from '../qr-design.service';
import { ServiceError } from '../errors';
import { createDefaultQRDesignConfig } from '@/types/qr-design.types';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

type Result = { data: unknown; error: unknown };

/**
 * Chainable Supabase mock. Every builder method returns the same builder;
 * terminal resolvers (single/maybeSingle/order) and awaiting the chain consume
 * `queue` in the exact order the service issues its calls. `eqCalls` records
 * every .eq(col,val) so tests can assert tenant scoping.
 */
function makeSupabase(queue: Result[]) {
  const results = [...queue];
  const next = (): Result => results.shift() ?? { data: null, error: null };
  const fromCalls: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];

  const builder: Record<string, unknown> = {};
  const passthrough = () => builder;
  builder.select = vi.fn(passthrough);
  builder.insert = vi.fn(passthrough);
  builder.update = vi.fn(passthrough);
  builder.delete = vi.fn(passthrough);
  builder.eq = vi.fn((col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return builder;
  });
  builder.neq = vi.fn(passthrough);
  builder.in = vi.fn(passthrough);
  builder.order = vi.fn(() => Promise.resolve(next()));
  builder.single = vi.fn(() => Promise.resolve(next()));
  builder.maybeSingle = vi.fn(() => Promise.resolve(next()));
  builder.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(next()).then(resolve, reject);

  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    return builder;
  });

  return {
    supabase: { from } as unknown as SupabaseClient,
    fromCalls,
    eqCalls,
  };
}

const config = createDefaultQRDesignConfig('#CCFF00');

describe('createQrDesignService.listDesigns', () => {
  it('filters by tenant_id and returns parsed rows', async () => {
    const { supabase, eqCalls } = makeSupabase([
      {
        data: [
          {
            id: 'd1',
            tenant_id: 'tenant-A',
            name: 'Salle',
            config,
            is_default: true,
            created_at: 'now',
            updated_at: 'now',
          },
        ],
        error: null,
      },
    ]);
    const service = createQrDesignService(supabase);
    const rows = await service.listDesigns('tenant-A');

    expect(eqCalls).toContainEqual(['tenant_id', 'tenant-A']);
    expect(rows).toHaveLength(1);
    expect(rows[0].config.printLayout.cardFormat).toBe('square-10');
  });

  it('throws ServiceError on DB error', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'boom' } }]);
    const service = createQrDesignService(supabase);
    await expect(service.listDesigns('tenant-A')).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('createQrDesignService.saveDesign', () => {
  it('rejects an invalid config with VALIDATION', async () => {
    const { supabase } = makeSupabase([]);
    const service = createQrDesignService(supabase);
    const bad = { ...config, qrFgColor: 'not-a-hex' };
    await expect(
      service.saveDesign('tenant-A', { name: 'x', config: bad, isDefault: false }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('inserts a new design scoped to the tenant', async () => {
    const { supabase, eqCalls, fromCalls } = makeSupabase([
      // 1) per-tenant cap count query
      { data: null, error: null, count: 3 } as unknown as Result,
      // 2) the insert
      {
        data: {
          id: 'new',
          tenant_id: 'tenant-A',
          name: 'Terrasse',
          config,
          is_default: false,
          created_at: 'now',
          updated_at: 'now',
        },
        error: null,
      },
    ]);
    const service = createQrDesignService(supabase);
    const row = await service.saveDesign('tenant-A', {
      name: 'Terrasse',
      config,
      isDefault: false,
    });

    expect(fromCalls).toContain('qr_designs');
    expect(row.id).toBe('new');
    // Insert path must scope the count query + insert to tenant-A (never another tenant).
    expect(eqCalls).toContainEqual(['tenant_id', 'tenant-A']);
  });

  it('rejects a new design once the per-tenant cap is reached', async () => {
    const { supabase } = makeSupabase([
      // cap count query returns >= 50
      { data: null, error: null, count: 50 } as unknown as Result,
    ]);
    const service = createQrDesignService(supabase);
    await expect(
      service.saveDesign('tenant-A', { name: 'Overflow', config, isDefault: false }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('createQrDesignService.assignDesignToTable', () => {
  it('rejects a design that does not belong to the tenant', async () => {
    // assertDesignOwned -> maybeSingle returns null (not owned)
    const { supabase } = makeSupabase([{ data: null, error: null }]);
    const service = createQrDesignService(supabase);
    await expect(
      service.assignDesignToTable('tenant-A', 'table-1', 'foreign-design'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('allows unassign (null design) without ownership check', async () => {
    // no ownership lookup; only the update await consumes one result
    const { supabase, eqCalls } = makeSupabase([{ data: [{ id: 'table-1' }], error: null }]);
    const service = createQrDesignService(supabase);
    await service.assignDesignToTable('tenant-A', 'table-1', null);
    expect(eqCalls).toContainEqual(['tenant_id', 'tenant-A']);
    expect(eqCalls).toContainEqual(['id', 'table-1']);
  });
});

describe('createQrDesignService: assignation sans ligne touchee (revue L013, A11)', () => {
  it('table absente ou d un autre restaurant: NOT_FOUND, pas de faux succes', async () => {
    const { supabase } = makeSupabase([{ data: [], error: null }]);
    const service = createQrDesignService(supabase);
    await expect(service.assignDesignToTable('tenant-A', 'table-x', null)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('zone absente: NOT_FOUND', async () => {
    const { supabase } = makeSupabase([{ data: [], error: null }]);
    const service = createQrDesignService(supabase);
    await expect(service.assignDesignToZone('tenant-A', 'zone-x', null)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('createQrDesignService.saveDesign: le defaut n est pas efface sur un refus (A10)', () => {
  it('plafond atteint avec isDefault: refus, AUCUNE ecriture', async () => {
    const { supabase } = makeSupabase([
      { data: null, error: null, count: 50 } as unknown as Result,
    ]);
    const service = createQrDesignService(supabase);
    await expect(
      service.saveDesign('tenant-A', { name: 'Nouveau', config, isDefault: true }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(supabase.from('qr_designs').update).not.toHaveBeenCalled();
  });

  it('design disparu avec isDefault: NOT_FOUND, AUCUNE ecriture', async () => {
    const { supabase } = makeSupabase([{ data: null, error: null }]);
    const service = createQrDesignService(supabase);
    await expect(
      service.saveDesign('tenant-A', {
        id: '550e8400-e29b-41d4-a716-446655440009',
        name: 'Ancien',
        config,
        isDefault: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(supabase.from('qr_designs').update).not.toHaveBeenCalled();
  });
});

describe('createQrDesignService.resolveDesignsForTables', () => {
  it('uses the table-level design when set', async () => {
    const tableConfig = { ...config, qrFgColor: '#111111' };
    const { supabase } = makeSupabase([
      { data: { primary_color: '#CCFF00', secondary_color: '#1A1A1A' }, error: null }, // tenant colors
      { data: null, error: null }, // no tenant default
      { data: [{ id: 'table-1', qr_design_id: 'd-table', zone_id: 'z1' }], error: null }, // tables
      { data: [{ id: 'd-table', config: tableConfig }], error: null }, // designs
    ]);
    const service = createQrDesignService(supabase);
    const resolved = await service.resolveDesignsForTables('tenant-A', ['table-1']);
    expect(resolved['table-1'].qrFgColor).toBe('#111111');
  });

  it('falls back to the zone design when the table has none', async () => {
    const zoneConfig = { ...config, qrFgColor: '#222222' };
    const { supabase } = makeSupabase([
      { data: { primary_color: '#CCFF00', secondary_color: '#1A1A1A' }, error: null }, // tenant colors
      { data: null, error: null }, // no tenant default
      { data: [{ id: 'table-1', qr_design_id: null, zone_id: 'z1' }], error: null }, // tables
      { data: [{ id: 'z1', qr_design_id: 'd-zone' }], error: null }, // zones
      { data: [{ id: 'd-zone', config: zoneConfig }], error: null }, // designs
    ]);
    const service = createQrDesignService(supabase);
    const resolved = await service.resolveDesignsForTables('tenant-A', ['table-1']);
    expect(resolved['table-1'].qrFgColor).toBe('#222222');
  });

  it('falls back to the factory default when nothing is assigned', async () => {
    const { supabase } = makeSupabase([
      { data: { primary_color: '#CCFF00', secondary_color: '#1A1A1A' }, error: null }, // tenant colors
      { data: null, error: null }, // no tenant default
      { data: [{ id: 'table-1', qr_design_id: null, zone_id: null }], error: null }, // tables
    ]);
    const service = createQrDesignService(supabase);
    const resolved = await service.resolveDesignsForTables('tenant-A', ['table-1']);
    expect(resolved['table-1'].templateId).toBe('minimal');
    expect(resolved['table-1'].templateAccentColor).toBe('#CCFF00');
  });

  it('nombre de requetes FIXE, quel que soit le nombre de tables (A9)', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `table-${i}`);
    const { supabase, fromCalls } = makeSupabase([
      { data: { primary_color: '#CCFF00', secondary_color: '#1A1A1A' }, error: null },
      { data: null, error: null },
      {
        data: ids.map((id) => ({ id, qr_design_id: null, zone_id: 'z1' })),
        error: null,
      },
      { data: [{ id: 'z1', qr_design_id: null }], error: null },
    ]);
    const service = createQrDesignService(supabase);
    const resolved = await service.resolveDesignsForTables('tenant-A', ids);
    expect(Object.keys(resolved)).toHaveLength(200);
    expect(fromCalls.length).toBeLessThanOrEqual(5);
  });
});
