import { describe, it, expect, vi, beforeEach } from 'vitest';

// Audit d'equipe du 2026-11-27 (convive C29): sans logo, le manifeste ne
// declarait qu'une icone de 48 px et la vitrine n'etait pas installable.

const { mockGetCachedTenant } = vi.hoisted(() => ({ mockGetCachedTenant: vi.fn() }));
vi.mock('@/lib/cache', () => ({ getCachedTenant: mockGetCachedTenant }));

import { GET } from '../route';

type Icon = { src: string; sizes: string; type?: string; purpose?: string };

async function icons(): Promise<Icon[]> {
  const res = await GET(new Request('http://localhost'), {
    params: Promise.resolve({ site: 'lepicurien' }),
  });
  return ((await res.json()) as { icons: Icon[] }).icons;
}

beforeEach(() => vi.clearAllMocks());

describe('manifeste PWA d un restaurant', () => {
  it('sans logo: icones 192, 512 et maskable (installable sur Android)', async () => {
    mockGetCachedTenant.mockResolvedValue({ is_active: true, name: 'Epicurien', logo_url: null });
    const list = await icons();
    expect(list.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    expect(list.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(list.some((i) => i.src === '/favicon.ico')).toBe(false);
  });

  it('avec logo: le logo en tete sans taille ni type inventes, puis les icones ATTABL', async () => {
    mockGetCachedTenant.mockResolvedValue({
      is_active: true,
      name: 'Epicurien',
      logo_url: 'https://cdn.example/logo.webp',
    });
    const list = await icons();
    expect(list[0]).toEqual({ src: 'https://cdn.example/logo.webp', sizes: 'any', purpose: 'any' });
    expect(list).toHaveLength(4);
  });
});
