import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations, getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import ClientMenuPage from '@/components/tenant/ClientMenuPage';
import { getCachedTenant } from '@/lib/cache';
import { computeOpeningState } from '@/lib/opening-hours';
import type {
  Announcement,
  MenuItem,
  Menu,
  Category,
  Ad,
  Zone,
  Table,
  Coupon,
} from '@/types/admin.types';

export const revalidate = 30;

// --- SEO Metadata -----------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  const tenant = await getCachedTenant(site);

  if (!tenant) {
    return { title: 'Menu | ATTABL' };
  }

  const description = `Consultez le menu de ${tenant.name} et commandez en ligne.`;

  return {
    title: `${tenant.name} - Menu Digital | ATTABL`,
    description,
    openGraph: {
      title: `${tenant.name} - Menu Digital`,
      description,
      ...(tenant.logo_url ? { images: [{ url: tenant.logo_url }] } : {}),
    },
  };
}

export default async function MenuPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{ table?: string; t?: string }>;
}) {
  const { site } = await params;
  const resolvedSearchParams = await searchParams;
  const initialTable = resolvedSearchParams.table || resolvedSearchParams.t || undefined;
  const messages = await getMessages();

  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  if (!tenantSlug) {
    return notFound();
  }

  const supabase = await createClient();

  // 1. Resolve tenant from cache
  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    const t = await getTranslations('tenant');
    return (
      <div className="h-full bg-white">
        <header className="bg-white shadow-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold capitalize" style={{ color: '#1A1A1A' }}>
              {tenantSlug}
            </h1>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12 bg-white rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold mb-2" style={{ color: '#737373' }}>
              {t('notConfiguredTitle')}
            </h2>
            <p style={{ color: '#737373' }}>{t('notConfiguredDesc', { slug: tenantSlug })}</p>
            <p className="text-sm mt-4" style={{ color: '#B0B0B0' }}>
              {t('notConfiguredHint')}
            </p>
          </div>
        </main>
      </div>
    );
  }

  const now = new Date().toISOString();

  // Parallel queries for all home page data
  const [
    menusResult,
    categoriesResult,
    adsResult,
    announcementsResult,
    featuredResult,
    recentResult,
    couponsResult,
  ] = await Promise.all([
    // Root menus only (parent_menu_id IS NULL) - sub-menus are fetched on demand
    // by the menu detail page when a parent is selected.
    supabase
      .from('menus')
      .select(
        'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, is_transversal_menu, display_order, created_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .eq('is_transversal_menu', false)
      .is('parent_menu_id', null)
      .order('display_order', { ascending: true }),

    supabase
      .from('categories')
      .select(
        'id, tenant_id, menu_id, name, name_en, display_order, is_active, is_featured_on_home, created_at, preparation_zone',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),

    supabase
      .from('ads')
      .select('id, tenant_id, image_url, link, sort_order, is_active, created_at')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),

    supabase
      .from('announcements')
      .select(
        'id, tenant_id, title, title_en, description, description_en, image_url, start_date, end_date, is_active, created_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('created_at', { ascending: false }),

    supabase
      .from('menu_items')
      .select(
        'id, tenant_id, category_id, name, name_en, description, description_en, price, image_url, is_available, is_featured, rating, rating_count, allergens, calories, created_at, category:categories(id, name, name_en), modifiers:item_modifiers(id, name, name_en, price, is_available, display_order)',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_featured', true)
      .eq('is_available', true)
      .order('display_order', { ascending: true })
      .limit(10),

    supabase
      .from('menu_items')
      .select(
        'id, tenant_id, category_id, name, name_en, description, description_en, price, image_url, is_available, is_featured, rating, rating_count, allergens, calories, created_at, category:categories(id, name, name_en)',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_available', true)
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('coupons')
      .select(
        'id, tenant_id, code, discount_type, discount_value, min_order_amount, max_discount_amount, valid_from, valid_until, max_uses, current_uses, is_active, created_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .or(`valid_until.is.null,valid_until.gte.${now}`),
  ]);

  const menus = (menusResult.data || []) as unknown as Menu[];
  const allCategories = (categoriesResult.data || []) as unknown as Category[];
  // When a tenant has multiple cartes (e.g. Panorama + Lobby + Pool), the home
  // must only show the categories of the primary carte. Otherwise categories
  // from different cartes would appear mixed in the CategoryGrid.
  // Primary carte = first root menu (ordered by display_order, already filtered
  // with parent_menu_id IS NULL in the query above).
  const primaryMenu = menus[0];
  // Step 1: restrict to primary carte when multiple cartes exist (task #1).
  const categoriesForPrimaryMenu =
    menus.length > 1 && primaryMenu
      ? allCategories.filter((cat) => cat.menu_id === primaryMenu.id)
      : allCategories;
  // Step 2: if the restaurateur has explicitly flagged categories via
  // is_featured_on_home, show only those on the home shortcut grid. Otherwise
  // fall back to the legacy behaviour (first N by display_order, capped in the
  // client CategoryGrid).
  const explicitlyFeatured = categoriesForPrimaryMenu.filter(
    (cat) => cat.is_featured_on_home === true,
  );
  const categories =
    explicitlyFeatured.length > 0 ? explicitlyFeatured.slice(0, 8) : categoriesForPrimaryMenu;
  const ads = (adsResult.data || []) as unknown as Ad[];
  const announcements = (announcementsResult.data || []) as unknown as Announcement[];
  const announcement = announcements[0] || null;
  const featuredItems = (featuredResult.data || []) as unknown as MenuItem[];
  const recentItems = (recentResult.data || []) as unknown as MenuItem[];
  const coupons = (couponsResult.data || []) as unknown as Coupon[];

  // Discounted items = featured items if there are active coupons, else empty
  const discountedItems: MenuItem[] = coupons.length > 0 ? featuredItems.slice(0, 10) : [];

  const sevenDaysAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [zonesResult, tablesResult, ordersCountResult, ratingAggResult] = await Promise.all([
    supabase
      .from('zones')
      .select('id, venue_id, name, name_en, prefix, display_order, created_at')
      .eq('tenant_id', tenant.id),
    supabase
      .from('tables')
      .select(
        'id, zone_id, table_number, display_name, capacity, is_active, qr_code_url, created_at',
      )
      .eq('tenant_id', tenant.id),
    // Social proof: orders count in the last 7 days for this tenant.
    // Uses head + count to avoid fetching rows. No PII.
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .in('status', ['delivered', 'served'])
      .gte('created_at', sevenDaysAgo),
    // Tenant-wide rating: aggregate of menu_items.rating for this tenant.
    supabase
      .from('menu_items')
      .select('rating, rating_count')
      .eq('tenant_id', tenant.id)
      .not('rating', 'is', null),
  ]);

  const zones = (zonesResult.data || []) as unknown as Zone[];
  const tables = (tablesResult.data || []) as unknown as Table[];

  // Social proof: only display if >= 10 to avoid weak signals.
  const ordersThisWeek =
    typeof ordersCountResult.count === 'number' && ordersCountResult.count >= 10
      ? ordersCountResult.count
      : null;

  // Rating aggregate: weighted by rating_count when available.
  const ratedItems = (ratingAggResult.data || []) as Array<{
    rating: number | null;
    rating_count: number | null;
  }>;
  const ratingAgg = (() => {
    let totalWeighted = 0;
    let totalWeight = 0;
    let totalCount = 0;
    for (const it of ratedItems) {
      if (typeof it.rating !== 'number') continue;
      const w = typeof it.rating_count === 'number' && it.rating_count > 0 ? it.rating_count : 1;
      totalWeighted += it.rating * w;
      totalWeight += w;
      totalCount += w;
    }
    if (totalWeight === 0 || totalCount < 5) return null;
    return { avg: Math.round((totalWeighted / totalWeight) * 10) / 10, count: totalCount };
  })();

  // Recommended-for-you: uses the tenant's own order history via
  // get_co_ordered_items RPC. On the home (no cart), we seed the query with
  // the featured items so the RPC returns items frequently co-ordered with
  // the tenant's popular dishes. Items already returned as "featured" are
  // excluded by the RPC itself (see migration 20260411000000).
  let recommendedItems: MenuItem[] = [];
  if (featuredItems.length > 0) {
    const seedIds = featuredItems.map((it) => it.id);
    const { data: coData } = await supabase.rpc('get_co_ordered_items', {
      p_tenant_id: tenant.id,
      p_cart_ids: seedIds,
      p_limit: 8,
    });
    const coIds = (coData || []).map((r: { menu_item_id: string }) => r.menu_item_id);
    if (coIds.length > 0) {
      const { data: recoData } = await supabase
        .from('menu_items')
        .select(
          'id, tenant_id, category_id, name, name_en, description, description_en, price, image_url, is_available, is_featured, rating, rating_count, allergens, calories, created_at, category:categories(id, name, name_en)',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_available', true)
        .in('id', coIds);
      const recoRows = (recoData || []) as unknown as MenuItem[];
      const byId = new Map<string, MenuItem>(recoRows.map((it) => [it.id, it]));
      recommendedItems = coIds
        .map((id: string) => byId.get(id))
        .filter((it: MenuItem | undefined): it is MenuItem => !!it);
    }
  }

  const openingState = computeOpeningState(tenant.opening_hours, new Date());

  return (
    <NextIntlClientProvider messages={messages}>
      <ClientMenuPage
        tenant={tenant}
        openingState={openingState}
        menus={menus}
        initialTable={initialTable}
        categories={categories}
        ads={ads}
        zones={zones}
        tables={tables}
        announcement={announcement}
        announcements={announcements}
        featuredItems={featuredItems}
        recentItems={recentItems}
        discountedItems={discountedItems}
        coupons={coupons}
        ordersThisWeek={ordersThisWeek}
        ratingAgg={ratingAgg}
        recommendedItems={recommendedItems}
      />
    </NextIntlClientProvider>
  );
}
