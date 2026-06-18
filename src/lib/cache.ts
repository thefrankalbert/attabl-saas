import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import {
  CACHE_TAG_MENUS,
  CACHE_TAG_TENANT_CONFIG,
  CACHE_TAG_TENANT_DOMAIN,
  tenantConfigTag,
  tenantMenusTag,
} from '@/lib/cache-tags';
import type { Category, Menu, MenuItem, Table, Tenant, Venue, Zone } from '@/types/admin.types';

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
  'id, name, slug, primary_color, secondary_color, logo_url, currency, supported_currencies, establishment_type, subscription_plan, subscription_status, trial_ends_at, onboarding_completed, enable_tax, tax_rate, enable_service_charge, service_charge_rate, table_count, is_active, description, address, city, country, phone, notification_sound_id, idle_timeout_minutes, screen_lock_mode, bar_display_enabled, opening_hours, enabled_payment_methods, activation_events, last_active_at, created_at';

/**
 * Per-tenant cache factory.
 * Each slug gets its own unstable_cache instance with tenant-scoped tags,
 * so revalidating one tenant's config does not flush all tenants.
 */
type CachedTenantFn = (slug: string) => Promise<Tenant | null>;

const tenantCacheMap = new Map<string, CachedTenantFn>();

function getOrCreateTenantCache(slug: string) {
  let cached = tenantCacheMap.get(slug);
  if (!cached) {
    cached = unstable_cache(
      async (s: string): Promise<Tenant | null> => {
        const supabase = createCacheClient();

        for (let attempt = 0; attempt < 2; attempt++) {
          const { data, error } = await supabase
            .from('tenants')
            .select(TENANT_SELECT)
            .eq('slug', s)
            .maybeSingle();

          if (!error) {
            return data;
          }

          if (attempt === 0) {
            logger.warn('getCachedTenant: retrying after transient failure', { slug: s });
          } else {
            throw new Error(`getCachedTenant failed for "${s}": ${error.message}`);
          }
        }

        throw new Error('getCachedTenant: unexpected code path');
      },
      [`${CACHE_TAG_TENANT_CONFIG}:${slug}`],
      { revalidate: 60, tags: [CACHE_TAG_TENANT_CONFIG, tenantConfigTag(slug)] },
    );
    tenantCacheMap.set(slug, cached);
  }
  return cached;
}

/**
 * Strip a tenant to its public-safe fields before it crosses into a Client
 * Component / browser-serialized context.
 *
 * The full `Tenant` carries billing (subscription_plan/status/trial), POS
 * config (screen_lock_mode, idle_timeout, notification_sound, bar_display) and
 * behavioral-tracking fields (activation_events, last_active_at) that anonymous
 * convive visitors must never see. Server Components and the middleware keep
 * using the full object; only the client TenantProvider gets this subset.
 */
export function toPublicTenant(t: Tenant): Tenant {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    logo_url: t.logo_url,
    primary_color: t.primary_color,
    secondary_color: t.secondary_color,
    font_family: t.font_family,
    is_active: t.is_active,
    created_at: t.created_at,
    currency: t.currency,
    supported_currencies: t.supported_currencies,
    tax_rate: t.tax_rate,
    service_charge_rate: t.service_charge_rate,
    enable_tax: t.enable_tax,
    enable_service_charge: t.enable_service_charge,
    enable_coupons: t.enable_coupons,
    establishment_type: t.establishment_type,
    city: t.city,
    country: t.country,
    table_count: t.table_count,
    description: t.description,
    address: t.address,
    phone: t.phone,
    opening_hours: t.opening_hours,
    enabled_payment_methods: t.enabled_payment_methods,
  };
}

/** Cached tenant config. Returns null on failure instead of crashing the page. */
export async function getCachedTenant(slug: string): Promise<Tenant | null> {
  try {
    const cacheFn = getOrCreateTenantCache(slug);
    return await cacheFn(slug);
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
export async function getTenant(slug: string): Promise<Tenant | null> {
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
  { revalidate: 300, tags: [CACHE_TAG_TENANT_DOMAIN] },
);

/**
 * Full client-facing menu payload for a single tenant.
 *
 * This is the heaviest read path in the product: every QR scan loads the
 * customer menu, which needs venues, categories, menu items (with their
 * modifiers), menus, transversal menus, zones and tables. Running these 7
 * queries on every request does not scale.
 *
 * The whole payload is wrapped in `unstable_cache`, keyed by tenantId, so
 * repeated scans for the same tenant are served from the Next.js data cache
 * instead of hitting Supabase. The menu page itself stays dynamic (it reads
 * headers()/searchParams for table/menu/section selection), but the expensive
 * data fetch is isolated here and cached independently of the request.
 *
 * Tenant isolation: every query filters by `tenant_id`, and the cache is keyed
 * + tagged per tenant, so one tenant's payload never leaks into another's.
 *
 * Cache key: `['menu-data', tenantId]`
 * Revalidation: 30 seconds OR on-demand. The shared `CACHE_TAG_MENUS` tag is
 * the same one menu/category server actions already revalidate, so structural
 * edits flush this cache instantly; the 30s window bounds staleness for the
 * remaining item/modifier edits (item availability also updates live via
 * realtime on the client).
 */
export interface CachedMenuData {
  venues: Venue[];
  categories: Category[];
  menuItems: MenuItem[];
  menus: Menu[];
  transversalMenus: Menu[];
  zones: Zone[];
  tables: Table[];
}

const EMPTY_MENU_DATA: CachedMenuData = {
  venues: [],
  categories: [],
  menuItems: [],
  menus: [],
  transversalMenus: [],
  zones: [],
  tables: [],
};

/**
 * Per-tenant cache factory for the full menu payload.
 * Each tenantId gets its own unstable_cache instance with tenant-scoped tags,
 * so revalidating one tenant's menu does not flush every tenant's payload.
 */
type CachedMenuDataFn = (tenantId: string) => Promise<CachedMenuData>;

const menuDataCacheMap = new Map<string, CachedMenuDataFn>();

function getOrCreateMenuDataCache(tenantId: string): CachedMenuDataFn {
  let cached = menuDataCacheMap.get(tenantId);
  if (!cached) {
    cached = unstable_cache(
      async (id: string): Promise<CachedMenuData> => {
        const supabase = createCacheClient();

        const [
          venuesResult,
          categoriesResult,
          menuItemsResult,
          menusResult,
          transversalMenusResult,
          zonesResult,
          tablesResult,
        ] = await Promise.all([
          supabase
            .from('venues')
            .select('id, tenant_id, name, name_en, slug, type, has_own_menu, is_active, created_at')
            .eq('tenant_id', id)
            .eq('is_active', true)
            .order('created_at', { ascending: true }),

          supabase
            .from('categories')
            .select(
              'id, tenant_id, menu_id, name, name_en, description, display_order, is_active, created_at, preparation_zone',
            )
            .eq('tenant_id', id)
            .eq('is_active', true)
            .order('display_order', { ascending: true }),

          supabase
            .from('menu_items')
            .select(
              `
              id, tenant_id, category_id, name, name_en, description, description_en,
              price, image_url, is_available, is_featured, allergens, calories, created_at,
              category:categories(id, tenant_id, name, name_en, created_at),
              modifiers:item_modifiers(id, tenant_id, menu_item_id, name, name_en, price, is_available, display_order, created_at)
            `,
            )
            .eq('tenant_id', id)
            .is('deleted_at', null)
            .eq('is_available', true)
            .order('created_at', { ascending: true }),

          supabase
            .from('menus')
            .select(
              'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at, children:menus!parent_menu_id(id, name, name_en, slug, description, is_active, display_order)',
            )
            .eq('tenant_id', id)
            .eq('is_active', true)
            .eq('is_transversal_menu', false)
            .is('parent_menu_id', null)
            .order('display_order', { ascending: true }),

          supabase
            .from('menus')
            .select(
              'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at, updated_at',
            )
            .eq('tenant_id', id)
            .eq('is_active', true)
            .eq('is_transversal_menu', true)
            .order('display_order', { ascending: true }),

          supabase
            .from('zones')
            .select('id, venue_id, name, name_en, prefix, display_order, created_at')
            .eq('tenant_id', id),

          supabase
            .from('tables')
            .select(
              'id, zone_id, table_number, display_name, capacity, is_active, qr_code_url, created_at',
            )
            .eq('tenant_id', id),
        ]);

        const firstError =
          venuesResult.error ||
          categoriesResult.error ||
          menuItemsResult.error ||
          menusResult.error ||
          transversalMenusResult.error ||
          zonesResult.error ||
          tablesResult.error;

        if (firstError) {
          logger.error('getCachedMenuData: failed to fetch menu payload', firstError, {
            tenantId: id,
          });
          // Throw so unstable_cache does not memoize an empty payload.
          throw new Error(`getCachedMenuData failed for "${id}": ${firstError.message}`);
        }

        return {
          venues: (venuesResult.data ?? []) as unknown as Venue[],
          categories: (categoriesResult.data ?? []) as unknown as Category[],
          menuItems: (menuItemsResult.data ?? []) as unknown as MenuItem[],
          menus: (menusResult.data ?? []) as unknown as Menu[],
          transversalMenus: (transversalMenusResult.data ?? []) as unknown as Menu[],
          zones: (zonesResult.data ?? []) as unknown as Zone[],
          tables: (tablesResult.data ?? []) as unknown as Table[],
        };
      },
      [`${CACHE_TAG_MENUS}:${tenantId}`],
      { revalidate: 30, tags: [CACHE_TAG_MENUS, tenantMenusTag(tenantId)] },
    );
    menuDataCacheMap.set(tenantId, cached);
  }
  return cached;
}

/**
 * Cached client-facing menu payload. Returns an empty payload on failure
 * instead of crashing the menu page (the page renders a "no menu" state).
 */
export async function getCachedMenuData(tenantId: string): Promise<CachedMenuData> {
  try {
    const cacheFn = getOrCreateMenuDataCache(tenantId);
    return await cacheFn(tenantId);
  } catch (err) {
    logger.error('getCachedMenuData: all attempts failed', err, { tenantId });
    return EMPTY_MENU_DATA;
  }
}
