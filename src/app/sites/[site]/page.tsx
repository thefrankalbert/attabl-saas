import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import ClientMenuPage from '@/components/tenant/ClientMenuPage';
import { getCachedTenant } from '@/lib/cache';
import type { Announcement, MenuItem, Venue, Category, Ad, Zone, Table } from '@/types/admin.types';

export const revalidate = 30;

// ─── SEO Metadata ─────────────────────────────────────────
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

// Types pour les donnees
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

  const headersList = await headers();
  // Use header if available (from middleware), otherwise use route params
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  if (!tenantSlug) {
    return notFound();
  }

  const supabase = await createClient();

  // 1. Recuperer le tenant via cache (requis avant les autres requetes)
  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    // En mode dev, afficher un placeholder si pas de tenant
    const t = await getTranslations('tenant');
    return (
      <div className="min-h-screen bg-app-bg">
        <header className="bg-app-card shadow-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold text-app-text capitalize">{tenantSlug}</h1>
          </div>
        </header>
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12 bg-app-card rounded-lg shadow-sm">
            <h2 className="text-xl font-semibold text-app-text-secondary mb-2">
              {t('notConfiguredTitle')}
            </h2>
            <p className="text-app-text-secondary">
              {t('notConfiguredDesc', { slug: tenantSlug })}
            </p>
            <p className="text-sm text-app-text-muted mt-4">{t('notConfiguredHint')}</p>
          </div>
        </main>
      </div>
    );
  }

  const now = new Date().toISOString();

  // OPTIMISATION: Requetes paralleles avec Promise.all
  const [venuesResult, categoriesResult, adsResult, announcementResult, featuredResult] =
    await Promise.all([
      // Venues (optionnel) - explicit columns to avoid SELECT *
      supabase
        .from('venues')
        .select('id, tenant_id, name, name_en, slug, type, has_own_menu, is_active, created_at')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),

      // Categories (for category grid on home)
      supabase
        .from('categories')
        .select(
          'id, tenant_id, menu_id, name, name_en, description, display_order, is_active, created_at, preparation_zone',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),

      // Ads / Banners
      supabase
        .from('ads')
        .select('id, tenant_id, image_url, link, sort_order, is_active, created_at')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),

      // Active announcement
      supabase
        .from('announcements')
        .select(
          'id, tenant_id, title, title_en, description, description_en, image_url, start_date, end_date, is_active, created_at',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .lte('start_date', now)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('created_at', { ascending: false })
        .limit(1),

      // Featured menu items
      supabase
        .from('menu_items')
        .select(
          'id, tenant_id, category_id, name, name_en, description, description_en, price, image_url, is_available, is_featured, allergens, calories, created_at, category:categories(id, name, name_en), modifiers:item_modifiers(id, name, name_en, price, is_available, display_order)',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_featured', true)
        .eq('is_available', true)
        .order('display_order', { ascending: true })
        .limit(10),
    ]);

  const venues = (venuesResult.data || []) as unknown as Venue[];
  const categories = (categoriesResult.data || []) as unknown as Category[];
  const ads = (adsResult.data || []) as unknown as Ad[];
  const announcement = (announcementResult.data?.[0] as Announcement) || null;
  const featuredItems = (featuredResult.data || []) as unknown as MenuItem[];

  // Fetch zones and tables (for TablePicker)
  const [zonesResult, tablesResult] = await Promise.all([
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
  ]);

  const zones = (zonesResult.data || []) as unknown as Zone[];
  const tables = (tablesResult.data || []) as unknown as Table[];

  return (
    <ClientMenuPage
      tenant={tenant}
      venues={venues}
      initialTable={initialTable}
      categories={categories}
      ads={ads}
      zones={zones}
      tables={tables}
      announcement={announcement}
      featuredItems={featuredItems}
    />
  );
}
