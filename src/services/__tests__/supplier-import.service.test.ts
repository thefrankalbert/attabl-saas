import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { createSupplierImportService } from '../supplier-import.service';
import { ServiceError } from '../errors';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

/** Build an .xlsx ArrayBuffer from an array-of-arrays. */
function buildXlsx(aoa: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

interface MockOpts {
  existing?: Array<{ id: string; name: string }>;
  loadError?: unknown;
  updateError?: unknown;
  insertError?: unknown;
}

function makeSupabase(opts: MockOpts = {}) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  let insertCount = 0;

  const from = vi.fn(() => ({
    select: () => ({
      eq: () => Promise.resolve({ data: opts.existing ?? [], error: opts.loadError ?? null }),
    }),
    update: (obj: Record<string, unknown>) => {
      updates.push(obj);
      return {
        eq: () => ({
          eq: () => Promise.resolve({ error: opts.updateError ?? null }),
        }),
      };
    },
    insert: (obj: Record<string, unknown>) => {
      inserts.push(obj);
      insertCount += 1;
      return {
        select: () => ({
          single: () =>
            Promise.resolve(
              opts.insertError
                ? { data: null, error: opts.insertError }
                : { data: { id: `new-${insertCount}` }, error: null },
            ),
        }),
      };
    },
  }));

  return { supabase: { from } as unknown as SupabaseClient, inserts, updates };
}

describe('supplier-import.service parseExcel', () => {
  it('maps tolerant FR/EN headers and parses rows', async () => {
    const { supabase } = makeSupabase();
    const svc = createSupplierImportService(supabase);
    const buffer = buildXlsx([
      ['Nom', 'Contact', 'Téléphone', 'Email', 'Adresse', 'Notes', 'Actif'],
      ['Boulangerie', 'Amadou', '+225 07', 'a@b.ci', 'Abidjan', 'Lundi', 'Oui'],
    ]);

    const { rows, errors } = await svc.parseExcel(buffer);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Boulangerie',
      contact_name: 'Amadou',
      phone: '+225 07',
      email: 'a@b.ci',
      is_active: true,
    });
  });

  it('throws VALIDATION when the required name column is missing', async () => {
    const { supabase } = makeSupabase();
    const svc = createSupplierImportService(supabase);
    const buffer = buildXlsx([
      ['Contact', 'Phone'],
      ['Amadou', '+225'],
    ]);
    await expect(svc.parseExcel(buffer)).rejects.toBeInstanceOf(ServiceError);
  });

  it('collects a row error for a bad email but keeps other rows', async () => {
    const { supabase } = makeSupabase();
    const svc = createSupplierImportService(supabase);
    const buffer = buildXlsx([
      ['Name', 'Email'],
      ['Good Co', 'ok@x.com'],
      ['Bad Co', 'not-an-email'],
    ]);
    const { rows, errors } = await svc.parseExcel(buffer);
    expect(rows.map((r) => r.name)).toEqual(['Good Co']);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
  });

  it('skips fully empty rows', async () => {
    const { supabase } = makeSupabase();
    const svc = createSupplierImportService(supabase);
    const buffer = buildXlsx([['Name'], ['A'], ['', ''], ['B']]);
    const { rows, errors } = await svc.parseExcel(buffer);
    expect(rows.map((r) => r.name)).toEqual(['A', 'B']);
    expect(errors).toHaveLength(0);
  });
});

describe('supplier-import.service importFromExcel', () => {
  it('updates existing (lower(name) match) and inserts new, with correct counts', async () => {
    const { supabase, inserts, updates } = makeSupabase({
      existing: [{ id: 's1', name: 'Boulangerie' }],
    });
    const svc = createSupplierImportService(supabase);
    const buffer = buildXlsx([
      ['Name', 'Phone'],
      ['boulangerie', '+225 11'], // case-insensitive match -> update
      ['Nouveau Fournisseur', '+225 22'], // new -> insert
    ]);

    const result = await svc.importFromExcel('tenant-1', buffer);
    expect(result.suppliersUpdated).toBe(1);
    expect(result.suppliersCreated).toBe(1);
    expect(result.suppliersSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ phone: '+225 11' });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ tenant_id: 'tenant-1', name: 'Nouveau Fournisseur' });
  });

  it('merges parse errors into the result and skips them', async () => {
    const { supabase } = makeSupabase({ existing: [] });
    const svc = createSupplierImportService(supabase);
    const buffer = buildXlsx([
      ['Name', 'Email'],
      ['Ok Co', 'ok@x.com'],
      ['Bad Co', 'nope'],
    ]);
    const result = await svc.importFromExcel('tenant-1', buffer);
    expect(result.suppliersCreated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.suppliersSkipped).toBe(1);
  });

  it('generateTemplate returns a Buffer with ASCII headers', async () => {
    const { supabase } = makeSupabase();
    const svc = createSupplierImportService(supabase);
    const buf = await svc.generateTemplate();
    expect(Buffer.isBuffer(buf)).toBe(true);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    const headers = (aoa[0] as string[]).join(',');
    expect(/^[\x00-\x7F]*$/.test(headers)).toBe(true);
    expect(headers).toContain('Name');
  });
});
