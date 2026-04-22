'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UtensilsCrossed, Clock, Star, TrendingUp, Search } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCartData } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import type {
  Menu,
  Category,
  Ad,
  Tenant,
  Zone,
  Table,
  Announcement,
  MenuItem,
  Coupon,
} from '@/types/admin.types';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import FullscreenSplash from '@/components/tenant/FullscreenSplash';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import TablePicker from '@/components/tenant/TablePicker';
import SearchOverlay from '@/components/tenant/SearchOverlay';
import EmptyState from '@/components/shared/EmptyState';
import { MENU_COLORS as C } from '@/lib/tenant/menu-tokens';
import { HeaderBar } from './menu/HeaderBar';
import { PromoBanner } from './menu/PromoBanner';
import { MenuCard } from './menu/MenuCard';
import { CategoryGrid } from './menu/CategoryGrid';
import { FeaturedItemCard } from './menu/FeaturedItemCard';
import { FloatingCartBar } from './menu/FloatingCartBar';
import { TenantInfoSheet } from './menu/TenantInfoSheet';

/* Small inline helpers kept local to the orchestrator: */

function SearchBar({ placeholder, onClick }: { placeholder: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="flex items-center gap-2 h-12 mt-2 mx-4 px-4 rounded-[10px] w-[calc(100%-32px)] justify-start"
      style={{ background: C.surfaceAlt }}
    >
      <Search size={20} color={C.textMuted} strokeWidth={2} aria-hidden />
      <span className="text-sm" style={{ color: C.textMuted }}>
        {placeholder}
      </span>
    </Button>
  );
}

function SectionHeader({
  title,
  onSeeAll,
  seeAllLabel,
}: {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  return (
    <div className="flex justify-between items-center pt-5 px-4 pb-3">
      <h2 className="text-xl font-bold m-0" style={{ color: C.textPrimary }}>
        {title}
      </h2>
      {onSeeAll && seeAllLabel && (
        <Button
          variant="ghost"
          onClick={onSeeAll}
          className="text-sm font-semibold px-0 h-auto"
          style={{ color: C.primary }}
        >
          {seeAllLabel}
        </Button>
      )}
    </div>
  );
}

function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex overflow-x-auto gap-3 px-4 pb-1 scrollbar-hide"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {children}
    </div>
  );
}

interface ClientMenuPageProps {
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
}

type HomeDietFilter = 'all' | 'vegetarian' | 'spicy' | 'glutenFree' | 'vegan';

export default function ClientMenuPage({
  tenant,
  openingState = { isOpen: true, nextOpenAt: null },
  menus = [],
  initialTable,
  categories,
  ads,
  zones,
  tables,
  announcement,
  announcements = [],
  featuredItems = [],
  recentItems = [],
  discountedItems = [],
  coupons = [],
  ordersThisWeek = null,
  ratingAgg = null,
  recommendedItems = [],
}: ClientMenuPageProps) {
  const t = useTranslations('tenant');
  const lang = typeof window !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'fr';

  const router = useRouter();
  const { toast } = useToast();
  const { items: cartItems, grandTotal } = useCartData();
  const { formatDisplayPrice, resolveAndFormatPrice } = useDisplayCurrency();
  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Keep coupons referenced (used to decide discount section visibility)
  void coupons;

  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isTenantInfoOpen, setIsTenantInfoOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [dietFilter, setDietFilter] = useState<HomeDietFilter>('all');

  const matchesDiet = (item: MenuItem): boolean => {
    if (dietFilter === 'all') return true;
    if (dietFilter === 'vegetarian') return !!item.is_vegetarian;
    if (dietFilter === 'spicy') return !!item.is_spicy;
    if (dietFilter === 'glutenFree') {
      const a = (item.allergens || []).map((x) => x.toLowerCase());
      return !a.some((x) => x.includes('gluten') || x.includes('wheat'));
    }
    if (dietFilter === 'vegan') {
      const a = (item.allergens || []).map((x) => x.toLowerCase());
      const hasAnimal = a.some((x) =>
        ['milk', 'lait', 'lactose', 'egg', 'oeuf', 'fish', 'poisson', 'meat', 'viande'].some((k) =>
          x.includes(k),
        ),
      );
      return !!item.is_vegetarian && !hasAnimal;
    }
    return true;
  };

  const [tableNumber, setTableNumber] = useState<string | null>(() => {
    if (initialTable) return initialTable;
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`attabl_${tenant.slug}_table`);
    }
    return null;
  });

  const [tableToastShown] = useState(() => {
    if (initialTable && typeof window !== 'undefined') {
      localStorage.setItem(`attabl_${tenant.slug}_table`, initialTable);
      queueMicrotask(() => {
        toast({
          title: t('tableIdentified'),
          description: t('seatedAtTable', { table: initialTable }),
        });
      });
      return true;
    }
    return false;
  });
  void tableToastShown;

  const handleRealtimeChange = useCallback(() => {
    router.refresh();
  }, [router]);

  useRealtimeSubscription({
    channelName: `home_categories_${tenant.id}`,
    table: 'categories',
    filter: `tenant_id=eq.${tenant.id}`,
    onChange: handleRealtimeChange,
  });
  useRealtimeSubscription({
    channelName: `home_menu_items_${tenant.id}`,
    table: 'menu_items',
    filter: `tenant_id=eq.${tenant.id}`,
    onChange: handleRealtimeChange,
  });

  const handleTableSelect = (table: Table) => {
    setTableNumber(table.table_number);
    localStorage.setItem(`attabl_${tenant.slug}_table`, table.table_number);
    toast({
      title: t('tableSelected'),
      description: t('seatedAtTable', { table: table.table_number }),
    });
  };

  const locationName = tableNumber ? t('dineInTable', { number: tableNumber }) : tenant.name;

  const allAnnouncements: Announcement[] =
    announcements.length > 0 ? announcements : announcement ? [announcement] : [];

  const reorderItems: MenuItem[] = (() => {
    if (totalCartItems === 0) return [];
    const ids = new Set(cartItems.map((ci) => ci.id));
    return featuredItems.filter((it) => ids.has(it.id)).slice(0, 10);
  })();

  const filteredFeatured = featuredItems.filter(matchesDiet);
  const filteredRecent = recentItems.filter(matchesDiet);
  const filteredDiscounted = discountedItems.filter(matchesDiet);
  const filteredReorder = reorderItems.filter(matchesDiet);
  const filteredRecommended = recommendedItems.filter(matchesDiet);

  const searchableItems: MenuItem[] = (() => {
    const seen = new Set<string>();
    const out: MenuItem[] = [];
    for (const item of [...featuredItems, ...recentItems, ...discountedItems]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  })();

  const hasAnyContent =
    categories.length > 0 ||
    menus.length > 0 ||
    featuredItems.length > 0 ||
    recentItems.length > 0 ||
    discountedItems.length > 0 ||
    ads.length > 0 ||
    allAnnouncements.length > 0;

  return (
    <div
      className="tenant-client w-full max-w-[430px] mx-auto h-full relative flex flex-col"
      style={{ background: C.background }}
    >
      <FullscreenSplash
        tenantName={tenant.name}
        logoUrl={tenant.logo_url}
        primaryColor={C.primary}
      />

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto pb-20"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* 1. Header */}
        <HeaderBar
          locationName={locationName}
          logoUrl={tenant.logo_url ?? null}
          tenantName={tenant.name}
          onLocationPress={() => setIsTablePickerOpen(true)}
          onAvatarPress={() => setIsTenantInfoOpen(true)}
        />

        {/* Closed banner */}
        {!openingState.isOpen && (
          <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
            <Clock size={16} />
            <span>{t('closedNow')}</span>
            {openingState.nextOpenAt && (
              <span className="text-gray-300">
                {t('opensAt', { time: openingState.nextOpenAt })}
              </span>
            )}
          </div>
        )}

        {/* Trust signals */}
        {(ratingAgg || ordersThisWeek) && (
          <div className="px-4 pt-1 pb-2 flex items-center gap-3 text-xs text-gray-600">
            {ratingAgg && (
              <span className="flex items-center gap-1">
                <Star size={13} className="fill-amber-500 text-amber-500" />
                <span className="font-semibold text-gray-900">{ratingAgg.avg}</span>
                <span className="text-gray-500">({ratingAgg.count})</span>
              </span>
            )}
            {ratingAgg && ordersThisWeek ? <span className="text-gray-300">-</span> : null}
            {ordersThisWeek && (
              <span className="flex items-center gap-1">
                <TrendingUp size={13} className="text-emerald-600" />
                <span>{t('ordersThisWeek', { count: ordersThisWeek })}</span>
              </span>
            )}
          </div>
        )}

        {/* 2. Search */}
        <SearchBar placeholder={t('searchPlaceholder')} onClick={() => setIsSearchOpen(true)} />

        {/* 3. Promo banner carousel */}
        <PromoBanner announcements={allAnnouncements} ads={ads} lang={lang} />

        {/* Global empty state */}
        {!hasAnyContent && (
          <div className="px-4 pt-10">
            <EmptyState
              icon={UtensilsCrossed}
              title={t('emptyMenu.title')}
              description={t('emptyMenu.description')}
            />
          </div>
        )}

        {/* 4. Categories */}
        {categories.length > 0 && (
          <>
            <SectionHeader title={t('browseCategories')} />
            <CategoryGrid
              categories={categories}
              lang={lang}
              onSelect={(cat) =>
                router.push(`/sites/${tenant.slug}/menu?section=${encodeURIComponent(cat.name)}`)
              }
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
          </>
        )}

        {/* 5. Nos Cartes (only if > 1 menu) */}
        {menus.length > 1 && (
          <>
            <SectionHeader title={t('ourMenus')} />
            <HScroll>
              {menus.map((menu) => (
                <MenuCard
                  key={menu.id}
                  menu={menu}
                  lang={lang}
                  onClick={() => router.push(`/sites/${tenant.slug}/menu?menu=${menu.slug}`)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* Diet chips filter row */}
        {(featuredItems.length > 0 || recentItems.length > 0 || discountedItems.length > 0) && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
            {(
              [
                { key: 'all', label: t('dietAll') },
                { key: 'vegetarian', label: t('dietVegetarian') },
                { key: 'spicy', label: t('dietSpicy') },
                { key: 'glutenFree', label: t('dietGlutenFree') },
                { key: 'vegan', label: t('dietVegan') },
              ] as { key: HomeDietFilter; label: string }[]
            ).map((chip) => {
              const isActive = dietFilter === chip.key;
              return (
                <Button
                  key={chip.key}
                  variant="ghost"
                  onClick={() => setDietFilter(chip.key)}
                  className="flex-shrink-0 whitespace-nowrap h-auto px-4 py-2 rounded-full text-[11px] font-medium uppercase tracking-wider"
                  style={{
                    backgroundColor: isActive ? '#1A1A1A' : '#F6F6F6',
                    color: isActive ? '#FFFFFF' : '#737373',
                  }}
                >
                  {chip.label}
                </Button>
              );
            })}
          </div>
        )}

        {/* 6. Populaires */}
        {filteredFeatured.length > 0 && (
          <>
            <SectionHeader
              title={t('mostOrdered')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredFeatured.map((item) => (
                <FeaturedItemCard
                  key={item.id}
                  item={item}
                  lang={lang}
                  badge="none"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 7. Nouveautes */}
        {filteredRecent.length > 0 && (
          <>
            <SectionHeader
              title={t('newOnMenu')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredRecent.map((item) => (
                <FeaturedItemCard
                  key={item.id}
                  item={item}
                  lang={lang}
                  badge="new"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 8. Promotions */}
        {filteredDiscounted.length > 0 && (
          <>
            <SectionHeader
              title={t('todayDeals')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredDiscounted.map((item) => (
                <FeaturedItemCard
                  key={`promo-${item.id}`}
                  item={item}
                  lang={lang}
                  badge="promo"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 9. Commander a nouveau */}
        {filteredReorder.length > 0 && (
          <>
            <SectionHeader
              title={t('orderAgain')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/cart`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredReorder.map((item) => (
                <FeaturedItemCard
                  key={`reorder-${item.id}`}
                  item={item}
                  lang={lang}
                  badge="none"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 10. Recommande pour vous */}
        {filteredRecommended.length > 0 && (
          <>
            <SectionHeader
              title={t('recommendedTitle')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredRecommended.map((item) => (
                <FeaturedItemCard
                  key={`reco-${item.id}`}
                  item={item}
                  lang={lang}
                  badge="none"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}
      </div>

      {/* Floating Cart Bar */}
      <FloatingCartBar
        totalItems={totalCartItems}
        totalPrice={formatDisplayPrice(grandTotal, tenant.currency)}
        href={`/sites/${tenant.slug}/cart`}
        viewCartLabel={t('viewCart')}
      />

      {/* Modals */}
      <TablePicker
        isOpen={isTablePickerOpen}
        onClose={() => setIsTablePickerOpen(false)}
        onSelect={handleTableSelect}
        zones={zones}
        tables={tables}
      />
      <TenantInfoSheet
        tenant={tenant}
        isOpen={isTenantInfoOpen}
        onClose={() => setIsTenantInfoOpen(false)}
        closeLabel={t('close')}
      />
      <InstallPrompt
        appName={tenant.name}
        logoUrl={tenant.logo_url}
        hasFloatingCart={totalCartItems > 0}
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
      <BottomNav tenantSlug={tenant.slug} />
    </div>
  );
}
