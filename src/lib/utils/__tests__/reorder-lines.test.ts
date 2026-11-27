import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planReorder } from '../reorder-lines';

// Audit d'equipe du 2026-11-27 (convive #48, contre-audit du lot 2): les DEUX
// boutons "Commander a nouveau" passent par planReorder.

function client(tables: Record<string, { data: unknown[] | null; error: unknown }>) {
  const eqs: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = (col: string, val: unknown) => {
      eqs.push([table, col, val]);
      return builder;
    };
    builder.in = () => Promise.resolve(tables[table]);
    return builder;
  });
  return { supabase: { from } as unknown as SupabaseClient, eqs, from };
}

const base = { price: 6000, quantity: 1, modifiers: [], notes: 'Grande' };

describe('planReorder', () => {
  it('remet la taille commandee, lue a la carte du MEME restaurant', async () => {
    const { supabase, eqs } = client({
      item_price_variants: {
        data: [
          {
            id: 'v1',
            menu_item_id: 'i1',
            variant_name_fr: 'Grande',
            variant_name_en: null,
            price: 6000,
          },
        ],
        error: null,
      },
      item_options: { data: [], error: null },
    });
    const plan = await planReorder(supabase, 'tenant-A', [
      { ...base, menu_item_id: 'i1', name: 'Brochettes' },
    ]);
    expect(plan?.lines[0].selectedVariant?.id).toBe('v1');
    expect(eqs).toContainEqual(['item_price_variants', 'tenant_id', 'tenant-A']);
    expect(eqs).toContainEqual(['item_options', 'tenant_id', 'tenant-A']);
  });

  it('ecarte un plat supprime au lieu d envoyer son nom comme identifiant', async () => {
    const { supabase } = client({
      item_price_variants: { data: [], error: null },
      item_options: { data: [], error: null },
    });
    const plan = await planReorder(supabase, 'tenant-A', [
      { ...base, notes: null, menu_item_id: null, name: 'Plat supprime' },
      { ...base, notes: null, menu_item_id: 'i2', name: 'Attieke' },
    ]);
    expect(plan?.lines.map((l) => l.id)).toEqual(['i2']);
  });

  it('plat a tailles dont la taille a disparu: a choisir a nouveau', async () => {
    const { supabase } = client({
      item_price_variants: {
        data: [
          {
            id: 'v2',
            menu_item_id: 'i1',
            variant_name_fr: 'Petite',
            variant_name_en: null,
            price: 4000,
          },
        ],
        error: null,
      },
      item_options: { data: [], error: null },
    });
    const plan = await planReorder(supabase, 'tenant-A', [
      { ...base, menu_item_id: 'i1', name: 'Brochettes' },
    ]);
    expect(plan).toEqual({ lines: [], toChooseAgain: ['Brochettes'] });
  });

  it('carte illisible: null, rien n est ajoute', async () => {
    const { supabase } = client({
      item_price_variants: { data: null, error: { message: 'down' } },
      item_options: { data: [], error: null },
    });
    await expect(
      planReorder(supabase, 'tenant-A', [{ ...base, menu_item_id: 'i1', name: 'Brochettes' }]),
    ).resolves.toBeNull();
  });
});
