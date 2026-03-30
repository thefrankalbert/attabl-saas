import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { CACHE_TAG_MENUS, CACHE_TAG_TENANT_CONFIG } from '@/lib/cache-tags';

/**
 * Supabase client for use inside unstable_cache.
 *
 * Uses the service role key (bypass RLS) with `cache: 'no-store'` on fetch
 * to prevent Next.js patched-fetch from conflicting with unstable_cache.
 */
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

/**
 * Cached tenant configuration.
 *
 * Wraps the tenant query with `unstable_cache` so that repeated reads
 * (site layout, admin layout, API routes) are served from the Next.js
 * data cache instead of hitting Supabase on every request.
 *
 * Cache key: `['tenant-config', slug]`
 * Revalidation: 60 seconds OR on-demand via `revalidateTag('tenant-config')`
 */
const TENANT_SELECT =
  'id, name, slug, primary_color, secondary_color, logo_url, currency, establishment_type, subscription_plan, subscription_status, trial_ends_at, onboarding_completed, enable_tax, tax_rate, enable_service_charge, service_charge_rate, table_count, is_active, description, address, city, country, phone, notification_sound_id, idle_timeout_minutes, screen_lock_mode, created_at';

const getCachedTenantInner = unstable_cache(
  async (slug: string) => {
    const supabase = createCacheClient();

    // Retry once to handle transient network failures
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await supabase
        .from('tenants')
        .select(TENANT_SELECT)
        .eq('slug', slug)
        .single();

      if (!error) return data;

      if (attempt === 0) {
        logger.warn('getCachedTenant: retrying after transient failure', { slug });
      } else {
        // Throw to prevent unstable_cache from caching a failure for 60s
        throw new Error(`getCachedTenant failed for "${slug}": ${error.message}`);
      }
    }

    // Unreachable, but satisfies TS
    throw new Error('getCachedTenant: unexpected code path');
  },
  [CACHE_TAG_TENANT_CONFIG],
  { revalidate: 60, tags: [CACHE_TAG_TENANT_CONFIG] },
);

/** Cached tenant config. Returns null on failure instead of crashing the page. */
export async function getCachedTenant(slug: string) {
  try {
    return await getCachedTenantInner(slug);
  } catch (err) {
    logger.error('getCachedTenant: all attempts failed', err, { slug });
    return null;
  }
}

/**
 * Fresh tenant config - bypasses all caching.
 *
 * Use this in admin pages (force-dynamic) where data must be 100% fresh
 * (e.g., right after onboarding, settings changes, etc.).
 * Public/client pages should continue using getCachedTenant.
 */
export async function getTenant(slug: string) {
  try {
    const supabase = createCacheClient();
    const { data, error } = await supabase
      .from('tenants')
      .select(TENANT_SELECT)
      .eq('slug', slug)
      .single();

    if (error) {
      logger.error('getTenant: failed', error, { slug });
      return null;
    }
    return data;
  } catch (err) {
    logger.error('getTenant: unexpected error', err, { slug });
    return null;
  }
}

/**
 * Cached tenant lookup by custom domain.
 * Used by middleware when the hostname doesn't match *.attabl.com
 */
export const getCachedTenantByDomain = unstable_cache(
  async (domain: string) => {
    const supabase = createCacheClient();
    const { data, error } = await supabase
      .from('tenants')
      .select('slug')
      .eq('custom_domain', domain)
      .single();

    if (error || !data) return null;
    return data.slug;
  },
  ['tenant-domain'],
  { revalidate: 300, tags: [CACHE_TAG_TENANT_CONFIG] },
);

/**
 * Cached active menu structure for a tenant.
 *
 * Returns all active menus ordered by display_order so that
 * client-facing pages can render the menu navigation without
 * hitting the DB on every page view.
 *
 * Cache key: `['menus', tenantId]`
 * Revalidation: 300 seconds OR on-demand via `revalidateTag('menus')`
 */
export const getCachedMenuStructure = unstable_cache(
  async (tenantId: string) => {
    const supabase = createCacheClient();
    const { data, error } = await supabase
      .from('menus')
      .select('id, name, name_en, slug, is_active, display_order, venue_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      logger.error('getCachedMenuStructure: failed to fetch menus', error, { tenantId });
      return [];
    }

    return data ?? [];
  },
  [CACHE_TAG_MENUS],
  { revalidate: 300, tags: [CACHE_TAG_MENUS] },
);
