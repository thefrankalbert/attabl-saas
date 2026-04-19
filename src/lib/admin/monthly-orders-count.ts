import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/**
 * Cached monthly orders count per tenant.
 *
 * Drives the sidebar usage card. The count is recomputed at most once per
 * TTL window per tenant, so the query does not hit Postgres on every admin
 * route navigation even for large accounts.
 *
 * Uses the service-role Supabase client inside the cache function (same
 * pattern as `src/lib/cache.ts`) because `unstable_cache` must be portable
 * across requests and cannot depend on per-request cookies.
 *
 * Key: `['monthly-orders-count', tenantId, monthStartIso]`
 *   → the month ISO in the key guarantees the cache rolls over automatically
 *     when the tenant's local month changes.
 * TTL: 300 s (5 min) OR until the tag is revalidated.
 */

const cacheMap = new Map<string, (monthStartIso: string) => Promise<number>>();

function createCacheClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

function monthlyOrdersCountTag(tenantId: string): string {
  return `monthly-orders-count:${tenantId}`;
}

function getOrCreate(tenantId: string) {
  let cached = cacheMap.get(tenantId);
  if (!cached) {
    cached = unstable_cache(
      async (monthStartIso: string): Promise<number> => {
        const supabase = createCacheClient();
        const { count, error } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .gte('created_at', monthStartIso);

        if (error) {
          logger.warn('monthly-orders-count: query failed', {
            tenantId,
            err: error.message,
          });
          return 0;
        }
        return count ?? 0;
      },
      [`monthly-orders-count:${tenantId}`],
      { revalidate: 300, tags: [monthlyOrdersCountTag(tenantId)] },
    );
    cacheMap.set(tenantId, cached);
  }
  return cached;
}

/**
 * Return the number of orders for the given tenant since `monthStart`.
 * Failure-tolerant: returns 0 on any error so the admin shell never crashes.
 */
export async function getMonthlyOrdersCount(tenantId: string, monthStart: Date): Promise<number> {
  try {
    const fn = getOrCreate(tenantId);
    return await fn(monthStart.toISOString());
  } catch (err) {
    logger.warn('monthly-orders-count: unexpected error', {
      tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
