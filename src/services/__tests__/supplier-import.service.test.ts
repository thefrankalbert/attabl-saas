import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupplierImportService } from '../supplier-import.service';
import { ServiceError } from '../errors';
import { buildXlsx } from './xlsx-fixture';
import { readFirstSheetRows } from '@/lib/excel-parse';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

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

// B100 (revue ligne par ligne, lot B2b-2): "Inactif" / "Inactive" n'etait pas
// reconnu, la valeur par defaut `true` s'appliquait: le fournisseur etait cree
// ou REMIS actif sans erreur.
describe('supplier-import.service parseExcel - statut actif (B100)', () => {
  it('reconnait actif, inactif, active, inactive (toute casse)', async () => {
    const { supabase } = makeSupabase();
    const { rows, errors } = await createSupplierImportService(supabase).parseExcel(
      await buildXlsx([
        ['Nom', 'Statut'],
        ['A', 'Inactif'],
        ['B', 'inactive'],
        ['C', 'Actif'],
        ['D', 'ACTIVE'],
        ['E', 'oui'],
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.is_active)).toEqual([false, false, true, true, true]);
  });

  it('une valeur non reconnue est une erreur de ligne, pas un fournisseur actif', async () => {
    const { supabase } = makeSupabase();
    const { rows, errors } = await createSupplierImportService(supabase).parseExcel(
      await buildXlsx([
        ['Nom', 'Statut'],
        ['A', 'en pause'],
        ['B', 'non'],
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(['B']);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);
  });
});

describe('supplier-import.service parseExcel', () => {
  it('maps tolerant FR/EN headers and parses rows', async () => {
    const { supabase } = makeSupabase();
    const svc = createSupplierImportService(supabase);
    const buffer = await buildXlsx([
      ['Nom', 'Contact', 'Téléphone', 'Email', 'Adresse', 'Notes', 'Actif'],
      ['Boulangerie', 'Amadou', '+225 07 07 07 07', 'a@b.ci', 'Abidjan', 'Lundi', 'Oui'],
    ]);

    const { rows, errors } = await svc.parseExcel(buffer);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Boulangerie',
      contact_name: 'Amadou',
      phone: '+225 07 07 07 07',
      email: 'a@b.ci',
      is_active: true,
    });
  });

  it('throws VALIDATION when the required name column is missing', async () => {
    const { supabase } = makeSupabase();
    const svc = createSupplierImportService(supabase);
    const buffer = await buildXlsx([
      ['Contact', 'Phone'],
      ['Amadou', '+225'],
    ]);
    await expect(svc.parseExcel(buffer)).rejects.toBeInstanceOf(ServiceError);
  });

  it('collects a row error for a bad email but keeps other rows', async () => {
    const { supabase } = makeSupabase();
    const svc = createSupplierImportService(supabase);
    const buffer = await buildXlsx([
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
    const buffer = await buildXlsx([['Name'], ['A'], ['', ''], ['B']]);
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
    const buffer = await buildXlsx([
      ['Name', 'Phone'],
      ['boulangerie', '+225 11 11 11 11'], // case-insensitive match -> update
      ['Nouveau Fournisseur', '+225 22 22 22 22'], // new -> insert
    ]);

    const result = await svc.importFromExcel('tenant-1', buffer);
    expect(result.suppliersUpdated).toBe(1);
    expect(result.suppliersCreated).toBe(1);
    expect(result.suppliersSkipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ phone: '+225 11 11 11 11' });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ tenant_id: 'tenant-1', name: 'Nouveau Fournisseur' });
  });

  it('merges parse errors into the result and skips them', async () => {
    const { supabase } = makeSupabase({ existing: [] });
    const svc = createSupplierImportService(supabase);
    const buffer = await buildXlsx([
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
    const aoa = await readFirstSheetRows(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    // Styled workbook adds a branded title band + subtitle before the header row,
    // so locate the header row by its known first column rather than assuming row 0.
    const headerRow = aoa.find((r) => (r as string[])?.includes('Name')) as string[] | undefined;
    expect(headerRow).toBeDefined();
    const headers = headerRow!.join(',');
    expect(/^[\x00-\x7F]*$/.test(headers)).toBe(true);
    expect(headers).toContain('Name');
  });
});

describe('supplier-import.service: memes bornes que la modification (B101)', () => {
  it('refuse un nom de 101 caracteres et un telephone que la fiche refuserait', async () => {
    const { supabase } = makeSupabase();
    const { rows, errors } = await createSupplierImportService(supabase).parseExcel(
      await buildXlsx([
        ['Nom', 'Téléphone'],
        ['N'.repeat(101), ''],
        ['Telephone trop long', '+225 07 07 07 07 07 07 07'],
        ['Telephone sans chiffres', 'appeler le gerant'],
        ['Fiche valide', '+225 07 07 07 07'],
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(['Fiche valide']);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4]);
  });

  it('temoin: un nom de 100 caracteres reste accepte', async () => {
    const { supabase } = makeSupabase();
    const { rows, errors } = await createSupplierImportService(supabase).parseExcel(
      await buildXlsx([['Nom'], ['N'.repeat(100)]]),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});
