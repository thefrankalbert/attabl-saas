import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/exchange-rate', () => ({ getUsdXafRate: vi.fn() }));

import { GET } from '../exchange-rate/route';
import { getUsdXafRate } from '@/lib/exchange-rate';

describe('GET /api/exchange-rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renvoie le taux du serveur, mis en cache une heure par le reseau de diffusion', async () => {
    vi.mocked(getUsdXafRate).mockResolvedValue(612.5);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rate: 612.5 });
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600');
  });
});
