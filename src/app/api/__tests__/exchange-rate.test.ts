import { describe, it, expect, vi, beforeEach } from 'vitest';

const check = vi.fn();
vi.mock('@/lib/rate-limit', () => ({
  exchangeRateLimiter: { check: (id: string) => check(id) },
  getClientIp: () => '203.0.113.7',
}));
vi.mock('@/lib/exchange-rate', () => ({ getUsdXafRate: vi.fn() }));

import { GET } from '../exchange-rate/route';
import { getUsdXafRate } from '@/lib/exchange-rate';

const requete = () => new Request('https://attabl.com/api/exchange-rate');

describe('GET /api/exchange-rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    check.mockResolvedValue({ success: true });
  });

  it('renvoie le taux du serveur, mis en cache une heure par le reseau de diffusion', async () => {
    vi.mocked(getUsdXafRate).mockResolvedValue(612.5);
    const res = await GET(requete());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rate: 612.5 });
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600');
    expect(check).toHaveBeenCalledWith('203.0.113.7');
  });

  it('refuse en 429 sans interroger le service quand la limite est atteinte', async () => {
    check.mockResolvedValue({ success: false });
    const res = await GET(requete());
    expect(res.status).toBe(429);
    expect(getUsdXafRate).not.toHaveBeenCalled();
  });
});
