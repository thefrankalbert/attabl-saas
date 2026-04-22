'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCartData } from '@/contexts/CartContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import type {
  Ad,
  Announcement,
  Category,
  Coupon,
  Menu,
  MenuItem,
  Table,
  Tenant,
  Zone,
} from '@/types/admin.types';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import SearchOverlay from '@/components/tenant/SearchOverlay';

import { AppHead } from './AppHead';
import { Greeting } from './Greeting';
import { SearchTrigger } from './SearchTrigger';
import { HeroChefPick } from './HeroChefPick';
import { SectionHeader } from './SectionHeader';
import { CategoryTile } from './CategoryTile';
import { VenueCard } from './VenueCard';
import { DishCardCompact } from './DishCardCompact';
import { HScroll } from './HScroll';
import { BottomNavRefonte } from './BottomNavRefonte';

/**
 * Maps a category name to a pre-shipped illustrative icon stored in
 * /public/category-icons. Same heuristic as the legacy ClientMenuPage so
 * restaurants do not need to upload category images to use the refonte.
 */
const CATEGORY_ICONS: Record<string, string> = {
  burger: 'burger.png',
  burgers: 'burger.png',
  entree: 'caribbean.png',
  entrees: 'caribbean.png',
  starters: 'caribbean.png',
  plats: 'caribbean.png',
  'plat principal': 'caribbean.png',
  'plats principaux': 'caribbean.png',
  grillade: 'caribbean.png',
  grills: 'caribbean.png',
  bbq: 'caribbean.png',
  asiatique: 'asian.png',
  asian: 'asian.png',
  soupe: 'asian.png',
  soupes: 'asian.png',
  pates: 'asian.png',
  pasta: 'asian.png',
  indien: 'indian.png',
  indian: 'indian.png',
  curry: 'indian.png',
  africain: 'indian.png',
  african: 'indian.png',
  'plats africains': 'indian.png',
  glace: 'ice-cream.png',
  glaces: 'ice-cream.png',
  americain: 'american.png',
  american: 'american.png',
  alcool: 'alcohol.png',
  alcohol: 'alcohol.png',
  vin: 'alcohol.png',
  wine: 'alcohol.png',
  biere: 'alcohol.png',
  beer: 'alcohol.png',
  cocktail: 'alcohol.png',
  cocktails: 'alcohol.png',
  aperitif: 'alcohol.png',
  boisson: 'alcohol.png',
  boissons: 'alcohol.png',
  chinois: 'chinese.png',
  chinese: 'chinese.png',
  francais: 'french.png',
  french: 'french.png',
  steak: 'french.png',
  halal: 'halal.png',
  poulet: 'halal.png',
  chicken: 'halal.png',
  dessert: 'dessert.png',
  desserts: 'dessert.png',
  patisserie: 'dessert.png',
  'fast food': 'fast-food.png',
  frites: 'fast-food.png',
  cafe: 'specialty.png',
  coffee: 'specialty.png',
  snack: 'convenience.png',
  snacks: 'convenience.png',
  sandwich: 'convenience.png',
  salade: 'specialty.png',
  salades: 'specialty.png',
  seafood: 'french.png',
  poisson: 'french.png',
};

function getCategoryImage(name: string): string {
  const lower = name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (CATEGORY_ICONS[lower]) return `/category-icons/${CATEGORY_ICONS[lower]}`;
  for (const [key, file] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key) || key.includes(lower)) {
      return `/category-icons/${file}`;
    }
  }
  return '/category-icons/specialty.png';
}

function pickTranslated(
  fr: string | null | undefined,
  en: string | null | undefined,
  lang: 'fr' | 'en',
): string {
  if (lang === 'en' && en) return en;
  return fr || en || '';
}

/**
 * Returns 'morning' | 'afternoon' | 'evening' based on current wall clock.
 * Uses a deterministic initial value (matches SSR) and upgrades to the real
 * bucket in useEffect to avoid hydration mismatches. The brief flash of
 * "Bonsoir" during the first paint is acceptable and invisible in practice
 * (it resolves within a React commit).
 */
function useGreetingBucket(): 'morning' | 'afternoon' | 'evening' {
  const [bucket, setBucket] = useState<'morning' | 'afternoon' | 'evening'>('evening');
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setBucket('morning');
    else if (h < 18) setBucket('afternoon');
    else setBucket('evening');
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  return bucket;
}

export interface ClientMenuPageRefonteProps {
  tenant: Tenant;
  openingState?: { isOpen: boolean; nextOpenAt: string | null };
  menus?: Menu[];
  initialTable?: string;
  categories: Category[];
  ads: Ad[];
  zones: Zone[];
  tables: Table[];
  announcement?: Announcement | null;
  announcements?: Announcement[];
  featuredItems?: MenuItem[];
  recentItems?: MenuItem[];
  discountedItems?: MenuItem[];
  coupons?: Coupon[];
  ordersThisWeek?: number | null;
  ratingAgg?: { avg: number; count: number } | null;
  recommendedItems?: MenuItem[];
  /** Full searchable index of all available menu items (up to 200). Used by
   *  SearchOverlay so any dish can be found, not just featured/recent. */
  searchableItems?: MenuItem[];
}

export default function ClientMenuPageRefonte({
  tenant,
  menus = [],
  initialTable,
  categories,
  featuredItems = [],
  recentItems = [],
  discountedItems = [],
  recommendedItems = [],
  searchableItems: searchablePool = [],
}: ClientMenuPageRefonteProps) {
  // Swallowed props (kept in signature for drop-in compatibility with the
  // parent Server Component). Will be re-introduced in later phases.
  void initialTable;

  const t = useTranslations('tenant');
  const router = useRouter();
  const lang: 'fr' | 'en' =
    typeof window !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'fr';

  const { items: cartItems, grandTotal } = useCartData();
  const { formatDisplayPrice } = useDisplayCurrency();
  const cartCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const handleSelectItem = useCallback(
    (item: MenuItem) => {
      setSelectedItem(item);
    },
    [setSelectedItem],
  );

  // Realtime refresh on category/item mutations - same pattern as legacy.
  const handleRealtime = useCallback(() => router.refresh(), [router]);
  useRealtimeSubscription({
    channelName: `home_categories_${tenant.id}`,
    table: 'categories',
    filter: `tenant_id=eq.${tenant.id}`,
    onChange: handleRealtime,
  });
  useRealtimeSubscription({
    channelName: `home_menu_items_${tenant.id}`,
    table: 'menu_items',
    filter: `tenant_id=eq.${tenant.id}`,
    onChange: handleRealtime,
  });

  // Hero: prefer featured, fall back to recent, then discounted.
  const heroItem = featuredItems[0] || recentItems[0] || discountedItems[0];

  // Popular: featured dishes minus the hero (no duplicate).
  const popularItems = featuredItems.length > 1 ? featuredItems.slice(1) : featuredItems;

  // Additional sections restored from legacy: reorder (from cart history),
  // recent additions, discounted, and personal recommendations. Each section
  // is only rendered when it has content, so the Accueil fills gracefully.
  const reorderItems = (() => {
    if (cartCount === 0) return [] as MenuItem[];
    const cartIds = new Set(cartItems.map((ci) => ci.id));
    return featuredItems.filter((it) => cartIds.has(it.id)).slice(0, 10);
  })();

  const categoryTiles = categories.slice(0, 8);
  const showVenuesSection = menus.length >= 2;

  // Search index: prefer the full searchable pool from the server (up to 200
  // items). Fall back to the union of featured/recent/discounted/recommended
  // when the pool is empty (dev environments without seeded searchables).
  const searchableItems: MenuItem[] = (() => {
    if (searchablePool.length > 0) return searchablePool;
    const seen = new Set<string>();
    const out: MenuItem[] = [];
    for (const it of [...featuredItems, ...recentItems, ...discountedItems, ...recommendedItems]) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
      }
    }
    return out;
  })();

  // Greeting bucket derived once on mount (deterministic SSR).
  const bucket = useGreetingBucket();
  const kicker =
    bucket === 'morning'
      ? t('refonteHomeGreetingMorning')
      : bucket === 'afternoon'
        ? t('refonteHomeGreetingAfternoon')
        : t('refonteHomeGreetingEvening');
  const editorialEm =
    bucket === 'evening' ? t('refonteHomeEditorialEm') : t('refonteHomeEditorialEmDay');

  const handleCategoryClick = (category: Category) => {
    const menu = menus.find((m) => m.id === category.menu_id);
    const menuParam = menu?.slug ? `?menu=${encodeURIComponent(menu.slug)}` : '';
    router.push(`/sites/${tenant.slug}/menu${menuParam}`);
  };

  const handleVenueClick = (menu: Menu) => {
    const slug = menu.slug ? encodeURIComponent(menu.slug) : '';
    router.push(`/sites/${tenant.slug}/menu${slug ? `?menu=${slug}` : ''}`);
  };

  return (
    <div
      data-slot="client-menu-refonte"
      className="tenant-client-refonte relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-[color:var(--cream)]"
    >
      <div className="flex-1 overflow-y-auto pb-24">
        <AppHead
          locationKicker={t('refonteHomeLocation')}
          venueName={tenant.name}
          logoUrl={tenant.logo_url ?? null}
          logoAltText={t('refonteHomeLogoAlt')}
          onLocationPress={() => router.push(`/sites/${tenant.slug}/settings`)}
          onLogoPress={() => router.push(`/sites/${tenant.slug}/settings`)}
        />

        <Greeting
          kicker={kicker}
          titleBefore={t('refonteHomeEditorialBefore')}
          titleEmphasis={editorialEm}
          titleAfter={t('refonteHomeEditorialAfter')}
        />

        <SearchTrigger
          placeholder={t('refonteHomeSearchPlaceholder')}
          ariaLabel={t('refonteHomeSearchAria')}
          onClick={() => setIsSearchOpen(true)}
        />

        {heroItem && (
          <div className="mt-4 px-4">
            <HeroChefPick
              item={heroItem}
              eyebrow={t('refonteSignature')}
              ctaLabel={t('refonteHomeDiscover')}
              onSelect={handleSelectItem}
              language={lang}
            />
          </div>
        )}

        {categoryTiles.length > 0 && (
          <section className="pt-5">
            <SectionHeader
              title={t('refonteHomeBrowse')}
              seeAllLabel={t('refonteHomeSeeAll')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
            />
            <div className="grid grid-cols-4 gap-2.5 px-4">
              {categoryTiles.map((cat) => {
                const label = pickTranslated(cat.name, cat.name_en, lang);
                return (
                  <CategoryTile
                    key={cat.id}
                    label={label}
                    imageUrl={getCategoryImage(cat.name)}
                    onClick={() => handleCategoryClick(cat)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {showVenuesSection && (
          <section className="pt-5">
            <SectionHeader
              title={t('refonteHomeVenues')}
              seeAllLabel={t('refonteHomeSeeAll')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
            />
            <HScroll ariaLabel={t('refonteHomeVenues')}>
              {menus.map((menu) => (
                <VenueCard
                  key={menu.id}
                  kicker={t('refonteHomeVenues')}
                  title={pickTranslated(menu.name, menu.name_en, lang)}
                  subtitle={
                    pickTranslated(menu.description, menu.description_en, lang) || undefined
                  }
                  imageUrl={menu.image_url ?? null}
                  onClick={() => handleVenueClick(menu)}
                />
              ))}
            </HScroll>
          </section>
        )}

        {reorderItems.length > 0 && (
          <section className="pt-5">
            <SectionHeader
              title={t('reorderTitle')}
              seeAllLabel={t('refonteHomeSeeAll')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/cart`)}
            />
            <HScroll ariaLabel={t('reorderTitle')}>
              {reorderItems.map((item) => (
                <DishCardCompact
                  key={`reorder-${item.id}`}
                  item={item}
                  onSelect={handleSelectItem}
                  language={lang}
                  quickAddLabel={t('refonteHomeQuickAdd')}
                />
              ))}
            </HScroll>
          </section>
        )}

        {popularItems.length > 0 && (
          <section className="pt-5">
            <SectionHeader
              title={t('refonteHomePopular')}
              seeAllLabel={t('refonteHomeSeeAll')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
            />
            <HScroll ariaLabel={t('refonteHomePopular')}>
              {popularItems.map((item) => (
                <DishCardCompact
                  key={item.id}
                  item={item}
                  onSelect={handleSelectItem}
                  language={lang}
                  quickAddLabel={t('refonteHomeQuickAdd')}
                />
              ))}
            </HScroll>
          </section>
        )}

        {discountedItems.length > 0 && (
          <section className="pt-5">
            <SectionHeader
              title={t('discountedTitle')}
              seeAllLabel={t('refonteHomeSeeAll')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
            />
            <HScroll ariaLabel={t('discountedTitle')}>
              {discountedItems.map((item) => (
                <DishCardCompact
                  key={`disc-${item.id}`}
                  item={item}
                  onSelect={handleSelectItem}
                  language={lang}
                  quickAddLabel={t('refonteHomeQuickAdd')}
                />
              ))}
            </HScroll>
          </section>
        )}

        {recentItems.length > 0 && (
          <section className="pt-5">
            <SectionHeader
              title={t('recentTitle')}
              seeAllLabel={t('refonteHomeSeeAll')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
            />
            <HScroll ariaLabel={t('recentTitle')}>
              {recentItems.map((item) => (
                <DishCardCompact
                  key={`recent-${item.id}`}
                  item={item}
                  onSelect={handleSelectItem}
                  language={lang}
                  quickAddLabel={t('refonteHomeQuickAdd')}
                />
              ))}
            </HScroll>
          </section>
        )}

        {recommendedItems.length > 0 && (
          <section className="pt-5">
            <SectionHeader
              title={t('recommendedTitle')}
              seeAllLabel={t('refonteHomeSeeAll')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
            />
            <HScroll ariaLabel={t('recommendedTitle')}>
              {recommendedItems.map((item) => (
                <DishCardCompact
                  key={`reco-${item.id}`}
                  item={item}
                  onSelect={handleSelectItem}
                  language={lang}
                  quickAddLabel={t('refonteHomeQuickAdd')}
                />
              ))}
            </HScroll>
          </section>
        )}
      </div>

      {/* Floating cart summary: appears when cart has items. Sticks just
          above the bottom nav. Matches the legacy ATTABL bottom bar pattern
          (icon + view label + count + dot + total) the user missed. */}
      {cartCount > 0 && (
        <div
          className="absolute inset-x-0 z-[35] flex justify-center px-4"
          style={{
            bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)',
          }}
        >
          <Link
            href={`/sites/${tenant.slug}/cart`}
            className="inline-flex h-12 max-w-[calc(100%-32px)] items-center gap-2.5 rounded-full bg-[color:var(--navy)] px-4 text-white shadow-[var(--sh-float)] no-underline"
          >
            <ShoppingBag className="h-5 w-5" aria-hidden />
            <span className="whitespace-nowrap text-sm font-bold">{t('viewCart')}</span>
            <span className="whitespace-nowrap text-sm font-bold">{cartCount}</span>
            <span aria-hidden className="inline-block h-[5px] w-[5px] rounded-full bg-white" />
            <span className="whitespace-nowrap text-sm font-bold">
              {formatDisplayPrice(grandTotal, tenant.currency)}
            </span>
          </Link>
        </div>
      )}

      <BottomNavRefonte
        activeKey="home"
        slug={tenant.slug}
        cartCount={cartCount}
        labels={{
          home: t('refonteNavHome'),
          cart: t('refonteNavCart'),
          orders: t('refonteNavOrders'),
          account: t('refonteNavAccount'),
        }}
      />

      <ItemDetailSheet
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        restaurantId={tenant.id}
        category={selectedItem?.category?.name}
        currency={tenant.currency || 'XAF'}
        language={lang}
      />

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        items={searchableItems}
        restaurantId={tenant.id}
        currency={tenant.currency ?? undefined}
        onOpenDetail={(item) => {
          setIsSearchOpen(false);
          setSelectedItem(item);
        }}
      />

      <InstallPrompt
        appName={tenant.name}
        logoUrl={tenant.logo_url}
        hasFloatingCart={cartCount > 0}
      />
    </div>
  );
}
