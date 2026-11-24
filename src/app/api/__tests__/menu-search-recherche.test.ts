import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { menuQuery, type MenuRow } from './menu-search-double';

// B4 (revue ligne par ligne, lot B2b-2): la recherche convive servait les 150
// premiers plats et filtrait dans le navigateur. Elle cherche maintenant dans
// toute la carte, cote serveur. Le double APPLIQUE les filtres: un plat d'un
// autre restaurant, indisponible ou supprime n'est jamais renvoye, meme s'il
// correspond au terme (contre-audit 1, defaut 3).

vi.mock('@/lib/rate-limit', () => ({
  menuSearchLimiter: { check: vi.fn(async () => ({ success: true })) },
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  grouperAdresse: (ip: string) => ip,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { GET } from '../menu-search/route';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { headers } from 'next/headers';

const T1 = 'tenant-1';
const T2 = 'tenant-2';

function plat(id: string, name: string, extra: Partial<MenuRow> = {}): MenuRow {
  return {
    id,
    tenant_id: T1,
    name,
    name_en: null,
    description: null,
    price: 1000,
    is_available: true,
    deleted_at: null,
    ...extra,
  };
}

function carte(): MenuRow[] {
  const rows: MenuRow[] = Array.from({ length: 200 }, (_, i) =>
    plat(`p-${i}`, `Plat ${String(i).padStart(3, '0')}`),
  );
  rows.push(
    // Apres le 150e par ordre alphabetique, accents en base, pas dans la saisie.
    plat('zebu', 'Z\u00e9bu grill\u00e9', { description: 'Braise' }),
    plat('poulet', 'Poulet DG', { name_en: 'Chicken DG' }),
    // Correspondent au terme "zebu" mais ne doivent JAMAIS sortir:
    plat('zebu-autre-resto', 'Zebu du voisin', { tenant_id: T2 }),
    plat('zebu-indispo', 'Zebu en rupture', { is_available: false }),
    plat('zebu-supprime', 'Zebu retire', { deleted_at: '2026-11-01T00:00:00Z' }),
  );
  return rows;
}

function request(q: string): Request {
  return new Request(`http://localhost:3000/api/menu-search?q=${encodeURIComponent(q)}`);
}

async function ids(q: string): Promise<string[]> {
  const res = await GET(request(q));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { items: Array<{ id: string }> };
  return body.items.map((i) => i.id).sort();
}

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue({
    get: (k: string) => (k === 'x-tenant-slug' ? 'resto-un' : null),
  } as unknown as Awaited<ReturnType<typeof headers>>);
  vi.mocked(createAdminClient).mockReturnValue({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        single: async () => ({
          data: { id: T1, is_active: true, suspended_at: null, subscription_status: 'active' },
          error: null,
        }),
      };
      return q;
    },
  } as unknown as ReturnType<typeof createAdminClient>);
  const rows = carte();
  vi.mocked(createClient).mockResolvedValue({
    from: (table: string) => {
      if (table === 'menu_items') return menuQuery(rows);
      throw new Error(`Table inattendue: ${table}`);
    },
  } as unknown as SupabaseClient);
});

describe('GET /api/menu-search - recherche dans toute la carte (B4)', () => {
  it('trouve un plat situe apres le 150e, sans tenir compte des accents', async () => {
    expect(await ids('zebu')).toEqual(['zebu']);
  });

  it('ne renvoie jamais un plat d un autre restaurant, indisponible ou supprime', async () => {
    const trouves = await ids('zebu');
    expect(trouves).not.toContain('zebu-autre-resto');
    expect(trouves).not.toContain('zebu-indispo');
    expect(trouves).not.toContain('zebu-supprime');
  });

  // Saturation: 60 plats qui correspondent mais ne doivent pas sortir, places
  // AVANT ceux du restaurant par ordre alphabetique. Si le parcours ne filtrait
  // pas, ils occuperaient les 50 places et la reponse serait vide.
  it.each([
    ['d un autre restaurant', { tenant_id: T2 }],
    ['indisponibles', { is_available: false }],
    ['supprimes', { deleted_at: '2026-11-01T00:00:00Z' }],
  ])('les plats %s ne prennent pas les places des resultats', async (_l, extra) => {
    const rows = [
      ...Array.from({ length: 60 }, (_, i) => plat(`x-${i}`, `Aaa riz ${i}`, extra)),
      ...Array.from({ length: 3 }, (_, i) => plat(`ok-${i}`, `Riz maison ${i}`)),
    ];
    vi.mocked(createClient).mockResolvedValue({
      from: () => menuQuery(rows),
    } as unknown as SupabaseClient);
    expect(await ids('riz')).toEqual(['ok-0', 'ok-1', 'ok-2']);
  });

  it('les deux lectures sont bornees au restaurant (tenant_id)', async () => {
    const tenantFilters: unknown[] = [];
    const rows = carte();
    vi.mocked(createClient).mockResolvedValue({
      from: () => {
        const q = menuQuery(rows);
        const eq = q.eq;
        q.eq = (column: string, value: unknown) => {
          if (column === 'tenant_id') tenantFilters.push(value);
          return eq(column, value);
        };
        return q;
      },
    } as unknown as SupabaseClient);
    await ids('zebu');
    expect(tenantFilters).toEqual([T1, T1]);
  });

  it('cherche aussi dans la description', async () => {
    expect(await ids('braise')).toEqual(['zebu']);
  });

  it('cherche aussi dans le nom anglais (name_en)', async () => {
    expect(await ids('chicken')).toEqual(['poulet']);
  });

  it('borne le nombre de resultats a 50', async () => {
    expect(await ids('plat')).toHaveLength(50);
  });

  it('refuse un terme vide, trop court ou trop long (400)', async () => {
    expect((await GET(request('   '))).status).toBe(400);
    expect((await GET(request('z'))).status).toBe(400);
    expect((await GET(request('x'.repeat(81)))).status).toBe(400);
  });
});
