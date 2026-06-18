import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { getCachedTenant } from '@/lib/cache';
import { computeOpeningState } from '@/lib/opening-hours';
import Link from 'next/link';
import type { MenuItem, Category, Menu, Table } from '@/types/admin.types';
import { HomeHeaderClient } from '@/components/tenant/client/HomeHeaderClient';
import { CategoryTile } from '@/components/tenant/client/CategoryTile';
import type { ClientCategory } from '@/components/tenant/client/CategoryTile';
import { HomeItemsSection } from '@/components/tenant/client/HomeItemsSection';
import { HomeHero } from '@/components/tenant/client/HomeHero';
import type { ClientMenuItem } from '@/components/tenant/client/MenuItemCard';
import { SectionHeader } from '@/components/tenant/client/SectionHeader';
import { deriveCategoryIconKey, getCategoryColors } from '@/components/tenant/client/CategoryIcon';
import { Photo } from '@/components/tenant/client/Photo';
import { sanitizeTypography } from '@/lib/utils/sanitize-typography';

export const revalidate = 30;

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

function toClientCategory(cat: Category): ClientCategory {
  const iconKey = deriveCategoryIconKey(cat.name);
  const colors = getCategoryColors(iconKey);
  return {
    id: cat.id,
    label: cat.name,
    icon: iconKey,
    bgColor: colors.bg,
    fgColor: colors.fg,
  };
}

function toClientMenuItem(item: MenuItem, featuredLabel: string): ClientMenuItem {
  const badges: ClientMenuItem['badges'] = [];
  if (item.is_featured) badges.push({ kind: 'popular', label: featuredLabel });
  return {
    id: item.id,
    categoryId: item.category_id,
    name: sanitizeTypography(item.name),
    description: item.description ? sanitizeTypography(item.description) : null,
    price: item.price,
    photoUrl: item.image_url ?? null,
    rating: item.rating ?? null,
    ratingCount: item.rating_count ?? null,
    badges: badges.length > 0 ? badges : undefined,
    isAvailable: item.is_available,
  };
}

export default async function HomePage({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const [messages, t] = await Promise.all([getMessages(), getTranslations('homePage')]);

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

  const [categoriesResult, featuredResult, recentResult, menusResult, tablesResult] =
    await Promise.all([
      supabase
        .from('categories')
        .select(
          'id, tenant_id, menu_id, name, name_en, display_order, is_active, is_featured_on_home, created_at, preparation_zone',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),

      supabase
        .from('menu_items')
        .select(
          `
        id, tenant_id, category_id, name, name_en, description, description_en,
        price, prices, image_url, is_available, is_featured, is_vegetarian, is_spicy, allergens, calories, rating, rating_count, created_at,
        category:categories(id, name, name_en),
        options:item_options(id, tenant_id, menu_item_id, name_fr, name_en, is_default, display_order, created_at),
        price_variants:item_price_variants(id, tenant_id, menu_item_id, variant_name_fr, variant_name_en, price, prices, display_order:sort_order, created_at),
        modifiers:item_modifiers(id, tenant_id, menu_item_id, name, name_en, price, is_available, display_order, created_at)
      `,
        )
        .eq('tenant_id', tenant.id)
        .is('deleted_at', null)
        .eq('is_featured', true)
        .eq('is_available', true)
        .order('created_at', { ascending: false })
        .limit(8),

      supabase
        .from('menu_items')
        .select(
          `
        id, tenant_id, category_id, name, name_en, description, description_en,
        price, prices, image_url, is_available, is_featured, is_vegetarian, is_spicy, allergens, calories, rating, rating_count, created_at,
        category:categories(id, name, name_en),
        options:item_options(id, tenant_id, menu_item_id, name_fr, name_en, is_default, display_order, created_at),
        price_variants:item_price_variants(id, tenant_id, menu_item_id, variant_name_fr, variant_name_en, price, prices, display_order:sort_order, created_at),
        modifiers:item_modifiers(id, tenant_id, menu_item_id, name, name_en, price, is_available, display_order, created_at)
      `,
        )
        .eq('tenant_id', tenant.id)
        .is('deleted_at', null)
        .eq('is_available', true)
        .order('created_at', { ascending: false })
        .limit(6),

      supabase
        .from('menus')
        .select('id, tenant_id, name, description, image_url, is_active, display_order')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(4),

      supabase
        .from('tables')
        .select(
          'id, tenant_id, zone_id, table_number, display_name, capacity, is_active, qr_code_url, created_at',
        )
        .eq('tenant_id', tenant.id)
        .eq('is_active', true),
    ]);

  const allCategories = (categoriesResult.data || []) as unknown as Category[];
  const featuredItems = (featuredResult.data || []) as unknown as MenuItem[];
  const recentItems = (recentResult.data || []) as unknown as MenuItem[];
  const menus = (menusResult.data || []) as unknown as Menu[];
  const tables = (tablesResult.data || []) as unknown as Table[];

  const clientCategories = allCategories.slice(0, 8).map(toClientCategory);

  const featuredLabel = t('featured');
  const featuredFull = featuredItems.slice(0, 6);
  const recentFull = recentItems.slice(0, 4);
  const featuredClients = featuredFull.map((item) => toClientMenuItem(item, featuredLabel));
  const recentClients = recentFull.map((item) => toClientMenuItem(item, featuredLabel));

  const openingState = computeOpeningState(tenant.opening_hours, new Date());

  // Plat du jour: prefer a featured dish, else fall back to the most recent
  // available item so the hero dish card (maquette) always shows.
  const heroSource: MenuItem | null = featuredItems[0] ?? recentItems[0] ?? null;
  const heroItem: ClientMenuItem | null = heroSource
    ? toClientMenuItem(heroSource, featuredLabel)
    : null;

  const hour = new Date().getHours();
  const period = hour < 11 ? 'matin' : hour < 17 ? 'midi' : 'soir';
  const greeting =
    period === 'matin'
      ? t('greetingMatin')
      : period === 'midi'
        ? t('greetingMidi')
        : t('greetingSoir');
  const greetingSub =
    period === 'matin'
      ? t('greetingSubMatin')
      : period === 'midi'
        ? t('greetingSubMidi')
        : t('greetingSubSoir');
  const periodLabel =
    period === 'matin' ? t('periodMatin') : period === 'midi' ? t('periodMidi') : t('periodSoir');

  const currencyCode = tenant.currency ?? 'XAF';
  const currencyUnit = currencyCode === 'XAF' || currencyCode === 'XOF' ? 'FCFA' : currencyCode;

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="pb-20">
        <HomeHeaderClient
          site={site}
          tenantName={tenant.name}
          tables={tables}
          popularItems={featuredClients}
          popularFull={featuredFull}
          featuredLabel={featuredLabel}
          currencyCode={currencyCode}
          isOpen={openingState.isOpen}
          restaurantId={tenant.id}
          currency={tenant.currency}
        />

        {/* - HERO - */}
        <div className="px-4 pb-6">
          {heroItem && heroSource ? (
            <HomeHero
              item={heroSource}
              name={heroItem.name}
              price={heroItem.price}
              photoUrl={heroItem.photoUrl}
              restaurantId={tenant.id}
              currencyCode={currencyCode}
              currencyUnit={currencyUnit}
            />
          ) : (
            <div
              className="relative h-[232px] overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-ink)] p-[20px]"
              style={{ border: `1px solid var(--color-ink)` }}
            >
              <div
                className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20 blur-[20px]"
                style={{ backgroundColor: 'var(--color-brand)' }}
              />
              <div className="relative">
                <div className="font-mono text-[11px] font-medium uppercase tracking-[0.6px] text-[var(--color-brand)]">
                  {periodLabel} &middot; {hour}H
                </div>
                <div className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-[-0.04em] text-white">
                  {greeting}.<br />
                  <span className="opacity-55">{greetingSub}</span>
                </div>
                {openingState.isOpen && (
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)]" />
                    {t('cuisineOuverte')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* - CATEGORIES - */}
        {clientCategories.length > 0 && (
          <section>
            <SectionHeader
              title={t('categories')}
              seeAllHref={`/sites/${site}/menu`}
              seeAllLabel={t('seeAll')}
            />
            <div className="grid grid-cols-4 gap-2.5 px-4">
              {clientCategories.map((cat) => (
                <CategoryTile
                  key={cat.id}
                  category={cat}
                  href={`/sites/${site}/menu?section=${encodeURIComponent(cat.label)}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* - NOS CARTES - */}
        {menus.length > 0 && (
          <section>
            <SectionHeader title={t('nosCartes')} subtitle={t('nosCartesSubtitle')} />
            <div className="grid grid-cols-2 gap-2.5 px-4">
              {menus.map((menu) => (
                <Link
                  key={menu.id}
                  href={`/sites/${site}/menu?menu=${menu.id}`}
                  className="relative h-[116px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)]"
                >
                  <div className="absolute inset-0">
                    <Photo
                      src={menu.image_url ?? null}
                      alt={menu.name}
                      kind="food"
                      fill
                      sizes="50vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[30%] to-black/78" />
                  </div>
                  <div className="absolute bottom-2.5 left-3 right-3 text-white">
                    {menu.description && (
                      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.5px] text-white/75">
                        {menu.description}
                      </div>
                    )}
                    <div className="mt-0.5 text-[14px] font-semibold leading-snug tracking-[-0.02em]">
                      {menu.name}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* - COUPS DE COEUR DU CHEF - */}
        {featuredClients.length > 0 && (
          <section>
            <SectionHeader
              title={t('coupsDeCoeur')}
              subtitle={t('coupsDeCoeurSubtitle')}
              seeAllHref={`/sites/${site}/menu`}
              seeAllLabel={t('seeAll')}
            />
            <HomeItemsSection
              display={featuredClients}
              full={featuredFull}
              variant="featured"
              containerClassName="flex gap-3.5 overflow-x-auto px-4 pb-2 scrollbar-none"
              restaurantId={tenant.id}
              currency={tenant.currency}
              currencyCode={currencyCode}
            />
          </section>
        )}

        {/* - NOUVEAUTES - */}
        {recentClients.length > 0 && (
          <section>
            <SectionHeader title={t('nouveautes')} subtitle={t('nouveautesSubtitle')} />
            <HomeItemsSection
              display={recentClients}
              full={recentFull}
              variant="list"
              containerClassName="px-4"
              restaurantId={tenant.id}
              currency={tenant.currency}
              currencyCode={currencyCode}
            />
          </section>
        )}
      </div>
    </NextIntlClientProvider>
  );
}
