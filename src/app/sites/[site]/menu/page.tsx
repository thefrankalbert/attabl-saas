import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ClientMenuDetailPage from '@/components/tenant/ClientMenuDetailPage';
import { getCachedTenant } from '@/lib/cache';
import type { Menu, Category, MenuItem, Venue, Zone, Table } from '@/types/admin.types';

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
    title: `${tenant.name} - Menu | ATTABL`,
    description,
    openGraph: {
      title: `${tenant.name} - Menu`,
      description,
      ...(tenant.logo_url ? { images: [{ url: tenant.logo_url }] } : {}),
    },
  };
}

export default async function MenuDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ site: string }>;
  searchParams: Promise<{
    table?: string;
    menu?: string;
    t?: string;
    v?: string;
    section?: string;
  }>;
}) {
  const { site } = await params;
  const resolvedSearchParams = await searchParams;
  const initialTable = resolvedSearchParams.table || resolvedSearchParams.t || undefined;
  const initialMenuSlug = resolvedSearchParams.menu || undefined;
  const initialVenueSlug = resolvedSearchParams.v || undefined;
  const initialSection = resolvedSearchParams.section || undefined;

  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  if (!tenantSlug) {
    return notFound();
  }

  const supabase = await createClient();

  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    return notFound();
  }

  // Parallel data fetching
  const [venuesResult, categoriesResult, menuItemsResult, menusResult, zonesResult, tablesResult] =
    await Promise.all([
      supabase
        .from('venues')
        .select('id, tenant_id, name, name_en, slug, type, has_own_menu, is_active, created_at')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),

      supabase
        .from('categories')
        .select(
          'id, tenant_id, menu_id, name, name_en, description, display_order, is_active, created_at, preparation_zone',
        )
        .eq('tenant_id', tenant.id)
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
        .eq('tenant_id', tenant.id)
        .eq('is_available', true)
        .order('created_at', { ascending: true }),

      supabase
        .from('menus')
        .select(
          'id, tenant_id, venue_id, parent_menu_id, name, name_en, slug, description, description_en, image_url, is_active, display_order, created_at, updated_at, children:menus!parent_menu_id(id, name, name_en, slug, description, is_active, display_order)',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .is('parent_menu_id', null)
        .order('display_order', { ascending: true }),

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

  const venues = (venuesResult.data || []) as unknown as Venue[];
  const categories = (categoriesResult.data || []) as unknown as Category[];
  const menuItems = (menuItemsResult.data || []) as unknown as MenuItem[];
  const menus = (menusResult.data || []) as Menu[];
  const zones = (zonesResult.data || []) as unknown as Zone[];
  const tables = (tablesResult.data || []) as unknown as Table[];

  // Group items by category
  const itemsByCategory = categories.map((category) => ({
    ...category,
    items: menuItems.filter((item) => item.category_id === category.id),
  }));

  return (
    <ClientMenuDetailPage
      tenant={tenant}
      venues={venues}
      menus={menus}
      initialMenuSlug={initialMenuSlug}
      initialTable={initialTable}
      initialVenueSlug={initialVenueSlug}
      initialSection={initialSection}
      categories={categories}
      itemsByCategory={itemsByCategory}
      zones={zones}
      tables={tables}
    />
  );
}
