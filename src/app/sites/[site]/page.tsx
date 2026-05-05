import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { getCachedTenant } from '@/lib/cache';
import { computeOpeningState } from '@/lib/opening-hours';
import Link from 'next/link';
import { Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MenuItem, Category, Menu, Announcement, Table } from '@/types/admin.types';
import { HomeHeaderClient } from '@/components/tenant/client/HomeHeaderClient';
import type { HomeSearchItem } from '@/components/tenant/client/HomeHeaderClient';
import { PromoCard } from '@/components/tenant/client/PromoCard';
import { CategoryTile } from '@/components/tenant/client/CategoryTile';
import type { ClientCategory } from '@/components/tenant/client/CategoryTile';
import { MenuItemCard } from '@/components/tenant/client/MenuItemCard';
import type { ClientMenuItem } from '@/components/tenant/client/MenuItemCard';
import { SectionHeader } from '@/components/tenant/client/SectionHeader';
import { deriveCategoryIconKey, getCategoryColors } from '@/components/tenant/client/CategoryIcon';
import { Photo } from '@/components/tenant/client/Photo';
import { fmtFCFA } from '@/lib/format';

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
    name: item.name,
    description: item.description ?? null,
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

  const now = new Date().toISOString();
  const [
    categoriesResult,
    featuredResult,
    recentResult,
    menusResult,
    announcementsResult,
    tablesResult,
    allItemsResult,
  ] = await Promise.all([
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
        'id, tenant_id, category_id, name, name_en, description, description_en, price, image_url, is_available, is_featured, rating, rating_count, allergens, calories, created_at, category:categories(id, name, name_en)',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_featured', true)
      .eq('is_available', true)
      .order('display_order', { ascending: true })
      .limit(8),

    supabase
      .from('menu_items')
      .select(
        'id, tenant_id, category_id, name, name_en, description, description_en, price, image_url, is_available, is_featured, rating, rating_count, allergens, calories, created_at, category:categories(id, name, name_en)',
      )
      .eq('tenant_id', tenant.id)
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
      .from('announcements')
      .select(
        'id, tenant_id, title, description, image_url, start_date, end_date, is_active, created_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('tables')
      .select(
        'id, tenant_id, zone_id, table_number, display_name, capacity, is_active, qr_code_url, created_at',
      )
      .eq('tenant_id', tenant.id)
      .eq('is_active', true),

    supabase
      .from('menu_items')
      .select('id, category_id, name, description, price')
      .eq('tenant_id', tenant.id)
      .eq('is_available', true)
      .order('name', { ascending: true })
      .limit(150),
  ]);

  const allCategories = (categoriesResult.data || []) as unknown as Category[];
  const featuredItems = (featuredResult.data || []) as unknown as MenuItem[];
  const recentItems = (recentResult.data || []) as unknown as MenuItem[];
  const menus = (menusResult.data || []) as unknown as Menu[];
  const tables = (tablesResult.data || []) as unknown as Table[];
  const announcements = ((announcementsResult.data || []) as unknown as Announcement[])
    .filter((ann) => !ann.end_date || ann.end_date >= now)
    .slice(0, 5);

  const categoryMap: Record<string, string> = Object.fromEntries(
    allCategories.map((c) => [c.id, c.name]),
  );
  const rawAllItems = (allItemsResult.data || []) as unknown as Array<{
    id: string;
    category_id: string;
    name: string;
    description: string | null;
    price: number;
  }>;
  const searchItems: HomeSearchItem[] = rawAllItems.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    categoryId: item.category_id,
    categoryName: categoryMap[item.category_id] ?? '',
  }));

  const clientCategories = allCategories.slice(0, 8).map(toClientCategory);

  const featuredLabel = t('featured');
  const featuredClients = featuredItems
    .slice(0, 6)
    .map((item) => toClientMenuItem(item, featuredLabel));
  const recentClients = recentItems
    .slice(0, 4)
    .map((item) => toClientMenuItem(item, featuredLabel));

  const openingState = computeOpeningState(tenant.opening_hours, new Date());

  const heroItem: ClientMenuItem | null =
    featuredItems.length > 0 ? toClientMenuItem(featuredItems[0], featuredLabel) : null;
  const heroCategoryId: string | null =
    featuredItems.length > 0 ? featuredItems[0].category_id : null;

  const tenantInitials = tenant.name
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="pb-20">
        <HomeHeaderClient
          site={site}
          tenantName={tenant.name}
          tenantInitials={tenantInitials}
          logoUrl={tenant.logo_url ?? null}
          tables={tables}
          searchItems={searchItems}
        />

        {/* ── HERO ── */}
        <div className="px-4 pb-6">
          {heroItem ? (
            <Link
              href={`/sites/${site}/menu${heroCategoryId ? `?cat=${heroCategoryId}` : ''}`}
              className="relative block h-[232px] overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-ink)]"
              aria-label={heroItem.name}
            >
              {heroItem.photoUrl && (
                <div className="absolute inset-0">
                  <Photo
                    src={heroItem.photoUrl}
                    alt={heroItem.name}
                    kind="food"
                    fill
                    sizes="100vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent from-[30%] to-black/85" />
                </div>
              )}
              <div className="relative flex h-full flex-col justify-between p-[18px]">
                <div className="flex items-start justify-between">
                  <Badge className="rounded-[4px] bg-[var(--color-ink)] px-[7px] py-[2px] font-mono text-[10.5px] font-semibold uppercase tracking-[0.2px] text-[var(--color-brand)] hover:bg-[var(--color-ink)]">
                    {t('platDuJour')}
                  </Badge>
                  <span className="flex items-center gap-1 rounded-[var(--radius-tag)] bg-white/15 px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.2px] text-white backdrop-blur-sm">
                    <Timer className="h-[11px] w-[11px]" />
                    {t('dispoHeure')}
                  </span>
                </div>
                <div>
                  <div className="font-mono text-[11px] font-medium uppercase tracking-[0.6px] text-white/65">
                    {t('suggestionChef')}
                  </div>
                  <div className="mt-1.5 text-[26px] font-semibold leading-[1.05] tracking-[-0.04em] text-white">
                    {heroItem.name}
                  </div>
                  <div className="mt-3.5 flex items-center gap-3.5">
                    <span className="text-[18px] font-semibold leading-none tracking-[-0.02em] text-white">
                      {fmtFCFA(heroItem.price)}{' '}
                      <span className="font-mono text-[11px] font-medium text-white/70">FCFA</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-[9px] text-[13px] font-semibold leading-none tracking-[-0.01em] text-[var(--color-ink)]">
                      {t('commander')}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
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

        {/* ── ANNONCES ── */}
        {announcements.length > 0 && (
          <section>
            <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
              {announcements.map((ann, i) => {
                const tones = ['brand', 'ink', 'warm'] as const;
                return (
                  <PromoCard
                    key={ann.id}
                    title={ann.title}
                    subtitle={ann.description ?? ''}
                    cta={t('voir')}
                    href={`/sites/${site}/menu`}
                    tone={tones[i % tones.length]}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ── CATEGORIES ── */}
        {clientCategories.length > 0 && (
          <section>
            <SectionHeader title={t('categories')} seeAllHref={`/sites/${site}/menu`} />
            <div className="grid grid-cols-4 gap-2.5 px-4">
              {clientCategories.map((cat) => (
                <CategoryTile
                  key={cat.id}
                  category={cat}
                  href={`/sites/${site}/menu?cat=${cat.id}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── NOS CARTES ── */}
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

        {/* ── COUPS DE COEUR DU CHEF ── */}
        {featuredClients.length > 0 && (
          <section>
            <SectionHeader
              title={t('coupsDeCoeur')}
              subtitle={t('coupsDeCoeurSubtitle')}
              seeAllHref={`/sites/${site}/menu`}
            />
            <div className="flex gap-3.5 overflow-x-auto px-4 pb-2 scrollbar-none">
              {featuredClients.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  href={`/sites/${site}/menu?cat=${item.categoryId}`}
                  variant="featured"
                />
              ))}
            </div>
          </section>
        )}

        {/* ── COMMANDES RECENTES ── */}
        {recentClients.length > 0 && (
          <section>
            <SectionHeader
              title={t('commandesRecentes')}
              subtitle={t('commandesRecentesSubtitle')}
            />
            <div className="px-4">
              {recentClients.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  href={`/sites/${site}/menu?cat=${item.categoryId}`}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </NextIntlClientProvider>
  );
}
