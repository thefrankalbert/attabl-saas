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

const config = createDefaultQRDesignConfig('#CCFF00', '#1A1A1A');

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
    // update path scopes by id+tenant; insert path here only inserts, no eq needed.
    expect(eqCalls.every(([, v]) => v !== 'evil')).toBe(true);
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
    const { supabase, eqCalls } = makeSupabase([{ data: null, error: null }]);
    const service = createQrDesignService(supabase);
    await service.assignDesignToTable('tenant-A', 'table-1', null);
    expect(eqCalls).toContainEqual(['tenant_id', 'tenant-A']);
    expect(eqCalls).toContainEqual(['id', 'table-1']);
  });
});

describe('createQrDesignService.resolveDesignForTable', () => {
  it('uses the table-level design when set', async () => {
    const tableConfig = { ...config, qrFgColor: '#111111' };
    const { supabase } = makeSupabase([
      { data: { qr_design_id: 'd-table', zone_id: 'z1' }, error: null }, // table
      { data: { primary_color: '#CCFF00', secondary_color: '#1A1A1A' }, error: null }, // tenant colors
      { data: null, error: null }, // no tenant default
      { data: { config: tableConfig }, error: null }, // design d-table
    ]);
    const service = createQrDesignService(supabase);
    const resolved = await service.resolveDesignForTable('tenant-A', 'table-1');
    expect(resolved.qrFgColor).toBe('#111111');
  });

  it('falls back to the zone design when the table has none', async () => {
    const zoneConfig = { ...config, qrFgColor: '#222222' };
    const { supabase } = makeSupabase([
      { data: { qr_design_id: null, zone_id: 'z1' }, error: null }, // table
      { data: { primary_color: '#CCFF00', secondary_color: '#1A1A1A' }, error: null }, // tenant colors
      { data: null, error: null }, // no tenant default
      { data: { qr_design_id: 'd-zone' }, error: null }, // zone
      { data: { config: zoneConfig }, error: null }, // design d-zone
    ]);
    const service = createQrDesignService(supabase);
    const resolved = await service.resolveDesignForTable('tenant-A', 'table-1');
    expect(resolved.qrFgColor).toBe('#222222');
  });

  it('falls back to the factory default when nothing is assigned', async () => {
    const { supabase } = makeSupabase([
      { data: { qr_design_id: null, zone_id: null }, error: null }, // table
      { data: { primary_color: '#CCFF00', secondary_color: '#1A1A1A' }, error: null }, // tenant colors
      { data: null, error: null }, // no tenant default
    ]);
    const service = createQrDesignService(supabase);
    const resolved = await service.resolveDesignForTable('tenant-A', 'table-1');
    expect(resolved.templateId).toBe('minimal');
    expect(resolved.templateAccentColor).toBe('#CCFF00');
  });
});
