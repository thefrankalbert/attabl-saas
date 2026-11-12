import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import ClientMenuDetailPage from '@/components/tenant/ClientMenuDetailPage';
import { getCachedTenant, getCachedMenuData, getTableOccupied, toPublicTenant } from '@/lib/cache';
import { keepKnownTable, resolveTableParam } from '@/lib/qr/table-param';
import { getStorefrontTenant } from '@/lib/billing/storefront-tenant';

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
  const scannedTable = resolveTableParam(resolvedSearchParams);
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

  const { tenant, access } = await getStorefrontTenant(tenantSlug);

  if (!tenant) {
    return notFound();
  }
  // Vitrine fermee: le layout affiche StorefrontUnavailable, mais cette page
  // est rendue en parallele et son payload partirait quand meme. Aucune
  // lecture de la carte, aucune donnee.
  if (access === 'closed') {
    return null;
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

  // C-061: an unknown table in the URL is ignored, never remembered.
  const initialTable = keepKnownTable(scannedTable, tables);

  // Soft warning: does the scanned table already hold an open session (a likely
  // other party)? Server-side + briefly cached so the page stays ISR.
  const tableOccupied = initialTable ? await getTableOccupied(tenant.id, initialTable) : false;

  return (
    <NextIntlClientProvider messages={messages}>
      <ClientMenuDetailPage
        tenant={toPublicTenant(tenant)}
        venues={venues}
        menus={menus}
        transversalMenus={transversalMenus}
        initialMenuSlug={initialMenuSlug}
        initialTable={initialTable}
        tableOccupied={tableOccupied}
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
