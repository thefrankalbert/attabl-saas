import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('getUsdXafRate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('appelle le service avec un delai d expiration', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { XAF: 610 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getUsdXafRate } = await import('../exchange-rate');
    expect(await getUsdXafRate()).toBe(610);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('garde le taux en memoire: un second appel ne rappelle pas le service', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { XAF: 610 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getUsdXafRate } = await import('../exchange-rate');
    await getUsdXafRate();
    await getUsdXafRate();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retombe sur 605 quand le service ne repond pas', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const { getUsdXafRate } = await import('../exchange-rate');
    expect(await getUsdXafRate()).toBe(605);
  });
});
