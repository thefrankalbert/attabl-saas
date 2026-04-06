import { logger } from '@/lib/logger';

const FALLBACK_RATE = 605;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedRate: number | null = null;
let cachedAt = 0;

/**
 * Fetch the current USD/XAF exchange rate with 24-hour in-memory caching.
 * Falls back to 605 if the API is unreachable.
 */
export async function getUsdXafRate(): Promise<number> {
  if (cachedRate !== null && Date.now() - cachedAt < TTL_MS) {
    return cachedRate;
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn('Exchange rate API returned non-OK status', { status: res.status });
      return cachedRate ?? FALLBACK_RATE;
    }

    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.XAF;

    if (typeof rate !== 'number' || rate <= 0) {
      logger.warn('Exchange rate API returned invalid XAF rate', { rate });
      return cachedRate ?? FALLBACK_RATE;
    }

    cachedRate = rate;
    cachedAt = Date.now();
    return rate;
  } catch (err) {
    logger.warn('Failed to fetch USD/XAF exchange rate', {
      error: err instanceof Error ? err.message : String(err),
    });
    return cachedRate ?? FALLBACK_RATE;
  }
}
