import { beforeEach, describe, expect, it, vi } from 'vitest';

// B72, contre-audit 2 (defaut 1, Haute): un plat au prix refuse entrait en base
// a 0 FCFA, disponible a la vente. Ici la VRAIE route et le VRAI service
// d'import PDF tournent; seuls le lecteur PDF, le modele et l'insertion en base
// (`bulkImportMenuRows`) sont des doublures. On verifie qu'AUCUN plat a 0
// n'atteint l'insertion, par l'apercu comme par l'import direct.

vi.mock('@/lib/billing/assert-tenant-serving', () => ({
  assertTenantServing: vi.fn(async () => undefined),
}));
vi.mock('@/lib/csrf', () => ({ verifyOrigin: vi.fn(() => null) }));
vi.mock('@/lib/rate-limit', () => ({
  pdfImportLimiter: { check: vi.fn(async () => ({ success: true })) },
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/plan-enforcement.service', () => ({
  createPlanEnforcementService: vi.fn(() => ({ canAddItems: vi.fn(async () => undefined) })),
}));

const state = vi.hoisted(() => ({ reply: '[]' }));
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    async getText() {
      return { text: 'Carte du restaurant, plusieurs plats', pages: [{}] };
    }
    async destroy() {}
  },
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: 'text', text: state.reply }],
        stop_reason: 'end_turn',
      }),
    };
  },
}));

type Grouped = Map<string, { items: Array<{ name: string; price: number }> }>;
const inserted: Array<{ name: string; price: number }> = [];
vi.mock('@/lib/menu-bulk-import', () => ({
  bulkImportMenuRows: vi.fn(async (_s: unknown, _t: string, _m: string, grouped: Grouped) => {
    for (const group of grouped.values()) inserted.push(...group.items);
    return {
      categoriesCreated: 1,
      categoriesExisting: 0,
      itemsCreated: inserted.length,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: [],
    };
  }),
}));

const supabase = {
  from: vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.single = vi.fn(async () => ({
      data: { id: 't1', subscription_plan: 'business', currency: 'XOF' },
      error: null,
    }));
    chain.maybeSingle = vi.fn(async () => ({ data: table === 'menus' ? { id: 'm1' } : null }));
    return chain;
  }),
};
vi.mock('@/lib/auth/get-session', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth/get-session')>('@/lib/auth/get-session');
  return {
    ...actual,
    getAuthenticatedUserWithTenant: vi.fn(async () => ({ tenantId: 't1', supabase })),
  };
});

import { POST } from '../menu-import-pdf/route';

const PLATS = [
  { category: 'Plats', name: 'Poulet DG', description: null, price: '2 500,00 FCFA' },
  { category: 'Plats', name: 'Braise', description: null, price: '1,500.50' },
  { category: 'Plats', name: 'Duo', description: null, price: '1500 / 2500' },
  { category: 'Plats', name: 'Inconnu', description: null, price: 0 },
  { category: 'Plats', name: 'Geant', description: null, price: '99999999999' },
  { category: 'Plats', name: 'Negatif', description: null, price: -500 },
];

function form(fields: Record<string, string | File>): Promise<Response> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return POST(new Request('http://localhost/api/menu-import-pdf', { method: 'POST', body: fd }));
}
const pdf = () => new File(['%PDF'], 'carte.pdf', { type: 'application/pdf' });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test';
  inserted.length = 0;
  state.reply = JSON.stringify(PLATS);
});

describe('import PDF de bout en bout: aucun plat a 0 n atteint l insertion', () => {
  it('apercu puis import: seuls les plats au prix lu partent, tous a un prix > 0', async () => {
    const apercu = await form({ menuId: 'm1', action: 'extract', file: pdf() });
    const body = (await apercu.json()) as {
      items: Array<{ name: string; price: number }>;
      notImported: Array<{ name: string; reason: string }>;
    };
    expect(body.items.map((i) => i.name)).toEqual(['Poulet DG']);
    expect(body.notImported.map((n) => n.name)).toEqual([
      'Braise',
      'Duo',
      'Inconnu',
      'Geant',
      'Negatif',
    ]);

    const res = await form({ menuId: 'm1', action: 'import', items: JSON.stringify(body.items) });
    expect(res.status).toBe(200);
    expect(inserted).toEqual([expect.objectContaining({ name: 'Poulet DG', price: 2500 })]);
    expect(inserted.every((i) => i.price > 0)).toBe(true);
  });

  it('une liste d apercu trafiquee avec un plat a 0 est refusee, rien n est insere', async () => {
    const res = await form({
      menuId: 'm1',
      action: 'import',
      items: JSON.stringify([
        { category: 'Plats', name: 'Poulet DG', description: null, price: 2500 },
        { category: 'Plats', name: 'Braise', description: null, price: 0 },
      ]),
    });
    expect(res.status).toBe(400);
    expect(inserted).toEqual([]);
  });

  // Contre-audit 3 (defaut 4): un prix a centimes trafique en francs CFA.
  it('une liste d apercu trafiquee avec un prix FCFA a centimes est refusee', async () => {
    const res = await form({
      menuId: 'm1',
      action: 'import',
      items: JSON.stringify([
        { category: 'Plats', name: 'Poulet DG', description: null, price: 2500 },
        { category: 'Plats', name: 'Braise', description: null, price: 1500.5 },
      ]),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('Braise');
    expect(inserted).toEqual([]);
  });

  it('import direct (sans apercu) avec des prix refuses: 400, rien n est insere', async () => {
    const res = await form({ menuId: 'm1', action: 'import', file: pdf() });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('Braise');
    expect(inserted).toEqual([]);
  });

  it('temoin: import direct d une carte entierement lisible: insere, prix > 0', async () => {
    state.reply = JSON.stringify([PLATS[0]]);
    const res = await form({ menuId: 'm1', action: 'import', file: pdf() });
    expect(res.status).toBe(200);
    expect(inserted.map((i) => i.price)).toEqual([2500]);
  });
});
