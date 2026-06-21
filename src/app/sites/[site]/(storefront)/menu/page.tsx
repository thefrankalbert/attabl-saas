import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import ClientMenuDetailPage from '@/components/tenant/ClientMenuDetailPage';
import { getCachedTenant, getCachedMenuData, toPublicTenant } from '@/lib/cache';

export const revalidate = 30;

// - SEO Metadata -
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
    item?: string;
  }>;
}) {
  const { site } = await params;
  const resolvedSearchParams = await searchParams;
  const initialTable = resolvedSearchParams.table || resolvedSearchParams.t || undefined;
  const initialMenuSlug = resolvedSearchParams.menu || undefined;
  const initialVenueSlug = resolvedSearchParams.v || undefined;
  const initialSection = resolvedSearchParams.section || undefined;
  const initialItemId = resolvedSearchParams.item || undefined;
  const messages = await getMessages();

  const headersList = await headers();
  const tenantSlug = headersList.get('x-tenant-slug') || site;

  if (!tenantSlug) {
    return notFound();
  }

  const tenant = await getCachedTenant(tenantSlug);

  if (!tenant) {
    return notFound();
  }

  // Heavy menu payload (venues, categories, items+modifiers, menus, zones,
  // tables) is fetched through a per-tenant cached function so repeated QR
  // scans are served from the Next.js data cache instead of re-running 7
  // Supabase queries on every request. Cache invalidation is driven by the
  // shared `menus` tag that menu/category server actions already revalidate.
  const { venues, categories, menuItems, menus, transversalMenus, zones, tables } =
    await getCachedMenuData(tenant.id);

  // Group items by category
  const itemsByCategory = categories.map((category) => ({
    ...category,
    items: menuItems.filter((item) => item.category_id === category.id),
  }));

  return (
    <NextIntlClientProvider messages={messages}>
      <ClientMenuDetailPage
        tenant={toPublicTenant(tenant)}
        venues={venues}
        menus={menus}
        transversalMenus={transversalMenus}
        initialMenuSlug={initialMenuSlug}
        initialTable={initialTable}
        initialVenueSlug={initialVenueSlug}
        initialSection={initialSection}
        initialItemId={initialItemId}
        categories={categories}
        itemsByCategory={itemsByCategory}
        zones={zones}
        tables={tables}
      />
    </NextIntlClientProvider>
  );
}
