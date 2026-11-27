import { logger } from '@/lib/logger';

const FALLBACK_RATE = 605;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
// Apres un echec, on ne rappelle pas le service tiers pendant ce delai: sans cela,
// chaque requete relancait un appel sortant de 5 s tant que le tiers etait en panne.
const FAILURE_TTL_MS = 5 * 60 * 1000;

let cachedRate: number | null = null;
let cachedAt = 0;
let failedAt: number | null = null;

/**
 * Fetch the current USD/XAF exchange rate with 24-hour in-memory caching.
 * Falls back to 605 if the API is unreachable.
 */
export async function getUsdXafRate(): Promise<number> {
  if (cachedRate !== null && Date.now() - cachedAt < TTL_MS) {
    return cachedRate;
  }

  if (failedAt !== null && Date.now() - failedAt < FAILURE_TTL_MS) {
    return cachedRate ?? FALLBACK_RATE;
  }

  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn('Exchange rate API returned non-OK status', { status: res.status });
      failedAt = Date.now();
      return cachedRate ?? FALLBACK_RATE;
    }

    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.XAF;

    if (typeof rate !== 'number' || rate <= 0) {
      logger.warn('Exchange rate API returned invalid XAF rate', { rate });
      failedAt = Date.now();
      return cachedRate ?? FALLBACK_RATE;
    }

    cachedRate = rate;
    cachedAt = Date.now();
    failedAt = null;
    return rate;
  } catch (err) {
    logger.warn('Failed to fetch USD/XAF exchange rate', {
      error: err instanceof Error ? err.message : String(err),
    });
    failedAt = Date.now();
    return cachedRate ?? FALLBACK_RATE;
  }
}
