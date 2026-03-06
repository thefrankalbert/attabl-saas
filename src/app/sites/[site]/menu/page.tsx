import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ClientMenuDetailPage from '@/components/tenant/ClientMenuDetailPage';
import { getCachedTenant } from '@/lib/cache';
import type { Menu, Category, MenuItem } from '@/types/admin.types';

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
    title: `${tenant.name} — Menu | ATTABL`,
    description,
    openGraph: {
      title: `${tenant.name} — Menu`,
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
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true }),

      supabase
        .from('categories')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),

      supabase
        .from('menu_items')
        .select(
          `
        *,
        category:categories(id, name, name_en),
        modifiers:item_modifiers(*)
      `,
        )
        .eq('tenant_id', tenant.id)
        .eq('is_available', true)
        .order('created_at', { ascending: true }),

      supabase
        .from('menus')
        .select('*, children:menus!parent_menu_id(*)')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .is('parent_menu_id', null)
        .order('display_order', { ascending: true }),

      supabase.from('zones').select('*').eq('tenant_id', tenant.id),

      supabase.from('tables').select('*').eq('tenant_id', tenant.id),
    ]);

  const venues = venuesResult.data || [];
  const categories = categoriesResult.data || [];
  const menuItems = menuItemsResult.data || [];
  const menus = (menusResult.data || []) as Menu[];
  const zones = zonesResult.data || [];
  const tables = tablesResult.data || [];

  // Group items by category
  const itemsByCategory = categories.map((category: Category) => ({
    ...category,
    items: menuItems.filter((item: MenuItem) => item.category_id === category.id),
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
