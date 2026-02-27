import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

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
export const getCachedTenant = unstable_cache(
  async (slug: string) => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenants')
      .select(
        'id, name, slug, primary_color, secondary_color, logo_url, currency, establishment_type, subscription_plan, subscription_status, trial_ends_at, onboarding_completed, enable_tax, tax_rate, enable_service_charge, service_charge_rate, table_count, is_active, description, address, phone, notification_sound_id, idle_timeout_minutes, screen_lock_mode, font_family, created_at',
      )
      .eq('slug', slug)
      .single();

    if (error) {
      logger.error('getCachedTenant: failed to fetch tenant', { slug, error: error.message });
      return null;
    }

    return data;
  },
  ['tenant-config'],
  { revalidate: 60, tags: ['tenant-config'] },
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
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('menus')
      .select('id, name, name_en, slug, is_active, display_order, venue_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      logger.error('getCachedMenuStructure: failed to fetch menus', {
        tenantId,
        error: error.message,
      });
      return [];
    }

    return data ?? [];
  },
  ['menus'],
  { revalidate: 300, tags: ['menus'] },
);
