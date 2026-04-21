'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Search, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCartData } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Venue, Category, MenuItem, Tenant, Zone, Table, Menu } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BottomNav from '@/components/tenant/BottomNav';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CategoryNav from '@/components/tenant/CategoryNav';
import TablePicker from '@/components/tenant/TablePicker';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import type { QRScanResult } from '@/components/tenant/QRScanner';
import SearchOverlay from '@/components/tenant/SearchOverlay';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => (
    <div className="h-64 animate-pulse rounded-lg" style={{ backgroundColor: '#F6F6F6' }} />
  ),
});

// ─── Helpers ────────────────────────────────────────────

// formatPrice is now handled by useDisplayCurrency().formatDisplayPrice

// ─── Types ──────────────────────────────────────────────

interface ClientMenuDetailPageProps {
  tenant: Tenant;
  venues: Venue[];
  menus: Menu[];
  transversalMenus?: Menu[];
  initialMenuSlug?: string;
  initialTable?: string;
  initialVenueSlug?: string;
  initialSection?: string;
  categories: Category[];
  itemsByCategory: { id: string; name: string; items: MenuItem[] }[];
  zones: Zone[];
  tables: Table[];
}

// ─── Component ──────────────────────────────────────────

export default function ClientMenuDetailPage({
  tenant,
  venues,
  menus,
  transversalMenus = [],
  initialMenuSlug,
  initialTable,
  initialVenueSlug,
  initialSection,
  categories,
  itemsByCategory,
  zones,
  tables,
}: ClientMenuDetailPageProps) {
  const t = useTranslations('tenant');
  const locale = useLocale();
  const lang = locale.startsWith('en') ? 'en' : 'fr';
  const router = useRouter();
  const { toast } = useToast();
  const { items: cartItems, grandTotal } = useCartData();
  const { formatDisplayPrice, resolveAndFormatPrice } = useDisplayCurrency();
  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // ─── State ─────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [, setTableNumber] = useState<string | null>(initialTable || null);
  const [searchQuery, setSearchQuery] = useState('');

  // Menu navigation state - auto-select menu containing the target section
  const [activeMenuSlug, setActiveMenuSlug] = useState<string | null>(() => {
    if (initialMenuSlug) return initialMenuSlug;
    if (menus.length <= 1) return menus[0]?.slug || null;

    // If a section is requested, find the menu that contains it
    if (initialSection) {
      const targetCat = categories.find(
        (c) => c.name.toLowerCase() === decodeURIComponent(initialSection).toLowerCase(),
      );
      if (targetCat?.menu_id) {
        // Find the parent menu (or the menu itself)
        const parentMenu = menus.find(
          (m) =>
            m.id === targetCat.menu_id || m.children?.some((ch) => ch.id === targetCat.menu_id),
        );
        if (parentMenu) return parentMenu.slug;
      }
    }

    return menus[0]?.slug || null;
  });
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(() => {
    // If section targets a sub-menu category, auto-select that sub-menu
    if (initialSection && menus.length > 1) {
      const targetCat = categories.find(
        (c) => c.name.toLowerCase() === decodeURIComponent(initialSection).toLowerCase(),
      );
      if (targetCat?.menu_id) {
        const isSubMenu = menus.some((m) => m.children?.some((ch) => ch.id === targetCat.menu_id));
        if (isSubMenu) return targetCat.menu_id;
      }
    }
    return null;
  });

  // Venue filter state
  const [activeVenueId, setActiveVenueId] = useState<string | null>(() => {
    if (initialVenueSlug) {
      const venue = venues.find((v) => v.slug === initialVenueSlug);
      return venue?.id || null;
    }
    return null;
  });

  // Realtime availability
  const [disabledItemIds, setDisabledItemIds] = useState<Set<string>>(new Set());

  // Filter chips (client-side)
  type DietFilter = 'all' | 'vegetarian' | 'spicy' | 'under';
  const [dietFilter, setDietFilter] = useState<DietFilter>('all');

  // ─── Table from localStorage ────────────────────────────
  useEffect(() => {
    if (!initialTable && typeof window !== 'undefined') {
      const saved = localStorage.getItem(`attabl_${tenant.slug}_table`);
      if (saved) setTableNumber(saved);
    }
  }, [initialTable, tenant.slug]);

  // ─── Scroll to section on mount ─────────────────────────
  useEffect(() => {
    if (!initialSection) return;

    const decodedSection = decodeURIComponent(initialSection).toLowerCase();
    const cat = categories.find((c) => c.name.toLowerCase() === decodedSection);
    if (!cat) return;

    const scrollToCategory = () => {
      const el = document.getElementById(`cat-${cat.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      return false;
    };

    // Try after initial render, retry if element not yet in DOM
    const t1 = setTimeout(() => {
      if (!scrollToCategory()) {
        const t2 = setTimeout(scrollToCategory, 600);
        return () => clearTimeout(t2);
      }
    }, 300);

    return () => clearTimeout(t1);
  }, [initialSection, categories]);

  // ─── Realtime subscriptions ────────────────────────────
  const handleRealtimeRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useRealtimeSubscription<{ id: string; is_available: boolean }>({
    channelName: `menu_items_realtime_${tenant.id}`,
    table: 'menu_items',
    filter: `tenant_id=eq.${tenant.id}`,
    onUpdate: (record) => {
      setDisabledItemIds((prev) => {
        const next = new Set(prev);
        if (!record.is_available) next.add(record.id);
        else next.delete(record.id);
        return next;
      });
    },
    onInsert: handleRealtimeRefresh,
    onDelete: handleRealtimeRefresh,
  });

  useRealtimeSubscription({
    channelName: `categories_realtime_${tenant.id}`,
    table: 'categories',
    filter: `tenant_id=eq.${tenant.id}`,
    onChange: handleRealtimeRefresh,
  });

  // ─── Filtering logic ──────────────────────────────────

  // Filter menus by venue
  const filteredMenus = activeVenueId
    ? menus.filter((m) => m.venue_id === activeVenueId || !m.venue_id)
    : menus;

  // Reset menu when venue changes
  useEffect(() => {
    if (filteredMenus.length > 0 && !filteredMenus.find((m) => m.slug === activeMenuSlug)) {
      setActiveMenuSlug(filteredMenus[0].slug);
      setActiveSubMenuId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVenueId]);

  const activeMenu = filteredMenus.find((m) => m.slug === activeMenuSlug) || null;

  // Filter items by menu/submenu
  // When multiple menus exist (or transversal menus are present), only show
  // categories explicitly linked to the active menu. Categories with no menu_id
  // are excluded (they must be assigned to a menu in admin).
  const hasMultipleMenus = menus.length > 1 || transversalMenus.length > 0;
  const menuFilteredByCategory = !hasMultipleMenus
    ? itemsByCategory
    : itemsByCategory.filter((cat) => {
        if (!activeMenu) return true;
        const category = categories.find((c) => c.id === cat.id);
        if (!category?.menu_id) return false;
        if (activeSubMenuId) {
          return category.menu_id === activeSubMenuId;
        }
        const activeMenuIds = [activeMenu.id, ...(activeMenu.children?.map((c) => c.id) || [])];
        return activeMenuIds.includes(category.menu_id);
      });

  // Compute "under" threshold as median price of current (menu-filtered) items
  const underThreshold = useMemo(() => {
    const allPrices = menuFilteredByCategory
      .flatMap((c) => c.items.map((i) => i.price))
      .filter((p): p is number => typeof p === 'number' && p > 0)
      .sort((a, b) => a - b);
    if (allPrices.length === 0) return 0;
    return allPrices[Math.floor(allPrices.length / 2)];
  }, [menuFilteredByCategory]);

  // Apply diet filter chips
  const filteredItemsByCategory = useMemo(() => {
    if (dietFilter === 'all') return menuFilteredByCategory;
    return menuFilteredByCategory
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          if (dietFilter === 'vegetarian') return !!item.is_vegetarian;
          if (dietFilter === 'spicy') return !!item.is_spicy;
          if (dietFilter === 'under') return item.price > 0 && item.price <= underThreshold;
          return true;
        }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [menuFilteredByCategory, dietFilter, underThreshold]);

  // Filter categories for CategoryNav - must match menuFilteredByCategory logic
  const filteredCategories = !hasMultipleMenus
    ? categories
    : categories.filter((c) => {
        if (!activeMenu) return true;
        if (!c.menu_id) return false;
        if (activeSubMenuId) return c.menu_id === activeSubMenuId;
        const activeMenuIds = [activeMenu.id, ...(activeMenu.children?.map((ch) => ch.id) || [])];
        return activeMenuIds.includes(c.menu_id);
      });

  const allItems = useMemo(() => itemsByCategory.flatMap((cat) => cat.items), [itemsByCategory]);

  // Build category item counts for nav pills
  const categoryItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of filteredItemsByCategory) {
      counts[cat.id] = cat.items.length;
    }
    return counts;
  }, [filteredItemsByCategory]);

  // Normalize text: lowercase + strip accents (e.g. "Taginé" -> "tagine", "Café" -> "cafe")
  const normalize = useCallback(
    (text: string) =>
      text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''),
    [],
  );

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = normalize(searchQuery);
    return allItems
      .filter((item) => {
        const name = normalize(item.name || '');
        const nameEn = normalize(item.name_en || '');
        const desc = normalize(item.description || '');
        return name.includes(q) || nameEn.includes(q) || desc.includes(q);
      })
      .slice(0, 8);
  }, [allItems, searchQuery, normalize]);

  // ─── Handlers ──────────────────────────────────────────

  const handleTableSelect = (table: Table) => {
    setTableNumber(table.table_number);
    localStorage.setItem(`attabl_${tenant.slug}_table`, table.table_number);
    toast({
      title: t('tableSelected'),
      description: t('seatedAtTable', { table: table.table_number }),
    });
  };

  const handleQRScan = (result: QRScanResult) => {
    if (result.tableNumber) {
      const matchedTable = tables.find(
        (tb) =>
          tb.table_number === result.tableNumber ||
          tb.table_number === result.tableNumber?.toUpperCase() ||
          tb.display_name === result.tableNumber,
      );

      if (matchedTable) {
        handleTableSelect(matchedTable);
      } else {
        setTableNumber(result.tableNumber);
        localStorage.setItem(`attabl_${tenant.slug}_table`, result.tableNumber);
        toast({
          title: t('tableIdentified'),
          description: t('seatedAtTable', { table: result.tableNumber }),
        });
      }
    } else {
      toast({
        title: t('qrScanned'),
        description: t('noTableDetected'),
        variant: 'destructive',
      });
    }

    if (result.menuSlug) {
      const matchedMenu = menus.find((m) => m.slug === result.menuSlug);
      if (matchedMenu) {
        setActiveMenuSlug(matchedMenu.slug);
        setActiveSubMenuId(null);
      }
    }
  };

  const handleMenuChange = (slug: string) => {
    setActiveMenuSlug(slug);
    setActiveSubMenuId(null);
    // Auto-sync venue when the selected menu is bound to one.
    // Prevents a stale venue filter when the venue tabs row is hidden.
    const next = menus.find((m) => m.slug === slug);
    if (next?.venue_id) setActiveVenueId(next.venue_id);
  };

  // Hide the venue-tabs row when the menu-tabs row already covers venues.
  // Rule: if every carte is bound to a venue (menu.venue_id IS NOT NULL),
  // picking a carte implicitly picks its venue, so showing both rows is
  // a redundant duplication (see CONTEXT.md section "Venue/Carte UI rule").
  const hideVenueRow = filteredMenus.length > 1 && filteredMenus.every((m) => !!m.venue_id);

  // Hide the menu-tabs row when the user entered via a specific carte URL
  // (?menu=slug). They already chose a carte - showing all the other cartes
  // again is navigation noise. A back link to the cartes list is offered
  // instead via the header back button.
  const hideMenuTabsRow = !!initialMenuSlug && filteredMenus.length > 1;

  // ─── Render ────────────────────────────────────────────
  return (
    <div
      className="flex-1 w-full"
      style={{
        backgroundColor: '#FFFFFF',
        paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {/* ═══ HEADER + SEARCH (same row) ═══ */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ backgroundColor: '#FFFFFF' }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/sites/${tenant.slug}`)}
          className="w-9 h-9 rounded-full bg-app-elevated flex-shrink-0"
          aria-label={t('ariaGoBack')}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: 'rgb(26, 26, 26)' }} />
        </Button>
        <div className="relative flex-1 min-w-0">
          <div
            className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
            style={{ color: '#B0B0B0' }}
          >
            <Search className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <Input
            type="text"
            placeholder={t('searchMenu')}
            className="w-full pl-9 pr-3 text-sm font-medium outline-none border-0 shadow-none focus-visible:ring-0"
            style={{
              backgroundColor: '#F6F6F6',
              borderRadius: '10px',
              height: '40px',
              color: '#1A1A1A',
            }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ═══ SEARCH RESULTS DROPDOWN ═══ */}
      <div className="px-4" style={{ backgroundColor: '#FFFFFF' }}>
        {/* Inline search results */}
        {searchQuery.length >= 2 && searchResults.length === 0 && (
          <p className="text-center text-sm py-8" style={{ color: '#B0B0B0' }}>
            {t('noSearchResults', { query: searchQuery })}
          </p>
        )}
        {searchQuery.length >= 2 && searchResults.length > 0 && (
          <div
            className="mt-2 rounded-xl overflow-hidden z-50 relative"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EEEEEE',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}
          >
            <div className="p-2">
              <h3
                className="px-3 py-2"
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#B0B0B0',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                {t('dishesFound')}
              </h3>
              {searchResults.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => {
                    setSelectedItem(item);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left justify-start h-auto"
                  style={{ backgroundColor: 'transparent' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#F6F6F6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: '#1A1A1A' }}>
                      {lang === 'en' && item.name_en ? item.name_en : item.name}
                    </p>
                  </div>
                  <span className="text-sm font-bold flex-shrink-0" style={{ color: '#1A1A1A' }}>
                    {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5" style={{ color: '#B0B0B0' }} />
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ VENUE FILTER PILLS ═══ */}
      {venues && venues.length > 1 && !hideVenueRow && (
        <div
          className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          <Button
            variant="ghost"
            onClick={() => setActiveVenueId(null)}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto',
              !activeVenueId ? 'text-white' : '',
            )}
            style={{
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase' as const,
              letterSpacing: 1,
              ...(!activeVenueId
                ? { backgroundColor: '#1A1A1A', color: '#FFFFFF' }
                : { backgroundColor: '#F6F6F6', color: '#737373' }),
            }}
          >
            {t('allFilter')}
          </Button>
          {venues.map((venue) => (
            <Button
              key={venue.id}
              variant="ghost"
              onClick={() => setActiveVenueId(venue.id)}
              className={cn('flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto')}
              style={{
                fontSize: 11,
                fontWeight: 500,
                textTransform: 'uppercase' as const,
                letterSpacing: 1,
                ...(activeVenueId === venue.id
                  ? { backgroundColor: '#1A1A1A', color: '#FFFFFF' }
                  : { backgroundColor: '#F6F6F6', color: '#737373' }),
              }}
            >
              {venue.name}
            </Button>
          ))}
        </div>
      )}

      {/* ═══ MENU TABS (multiple menus) ═══ */}
      {filteredMenus.length > 1 && !hideMenuTabsRow && (
        <div className="px-4 mb-3">
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide" data-tab-pane>
            {filteredMenus.map((menu) => (
              <Button
                key={menu.slug}
                variant="ghost"
                onClick={() => handleMenuChange(menu.slug)}
                className="flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 1,
                  ...(activeMenuSlug === menu.slug
                    ? { backgroundColor: '#1A1A1A', color: '#FFFFFF' }
                    : { backgroundColor: '#F6F6F6', color: '#737373' }),
                }}
              >
                {menu.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SUB-MENU TABS ═══ */}
      {activeMenu &&
        ((activeMenu.children && activeMenu.children.length > 0) ||
          transversalMenus.length > 0) && (
          <div className="px-4 mb-3">
            <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
              <Button
                variant="ghost"
                onClick={() => setActiveSubMenuId(null)}
                className="flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto"
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase' as const,
                  letterSpacing: 1,
                  ...(!activeSubMenuId
                    ? { backgroundColor: '#1A1A1A', color: '#FFFFFF' }
                    : { backgroundColor: '#F6F6F6', color: '#B0B0B0' }),
                }}
              >
                {t('all')}
              </Button>
              {(activeMenu.children || [])
                .filter((c) => c.is_active)
                .map((child) => (
                  <Button
                    key={child.slug}
                    variant="ghost"
                    onClick={() => setActiveSubMenuId(child.id)}
                    className="flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto"
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: 'uppercase' as const,
                      letterSpacing: 1,
                      ...(activeSubMenuId === child.id
                        ? { backgroundColor: '#1A1A1A', color: '#FFFFFF' }
                        : { backgroundColor: '#F6F6F6', color: '#B0B0B0' }),
                    }}
                  >
                    {child.name}
                  </Button>
                ))}
              {transversalMenus.map((tm) => (
                <Button
                  key={tm.slug}
                  variant="ghost"
                  onClick={() => setActiveSubMenuId(tm.id)}
                  className="flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto"
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: 'uppercase' as const,
                    letterSpacing: 1,
                    ...(activeSubMenuId === tm.id
                      ? { backgroundColor: '#1A1A1A', color: '#FFFFFF' }
                      : { backgroundColor: '#F6F6F6', color: '#B0B0B0' }),
                  }}
                >
                  {lang === 'en' && tm.name_en ? tm.name_en : tm.name}
                </Button>
              ))}
            </div>
          </div>
        )}

      {/* ═══ FILTER CHIPS (diet / price) - hidden on carte-detail view ═══
          Rule: on a specific ?menu=X view we keep a SINGLE navigation row
          (CategoryNav). Diet filters stay accessible via the search overlay. */}
      {!initialMenuSlug && (
        <div
          className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide"
          style={{ backgroundColor: '#FFFFFF' }}
        >
          {(
            [
              { key: 'all', label: t('filterAll') },
              { key: 'vegetarian', label: t('filterVegetarian') },
              { key: 'spicy', label: t('filterSpicy') },
              {
                key: 'under',
                label: t('filterUnder', {
                  price:
                    underThreshold > 0 ? formatDisplayPrice(underThreshold, tenant.currency) : '',
                }),
              },
            ] as { key: DietFilter; label: string }[]
          ).map((chip) => {
            const isActive = dietFilter === chip.key;
            return (
              <Button
                key={chip.key}
                variant="ghost"
                onClick={() => setDietFilter(chip.key)}
                className="flex-shrink-0 whitespace-nowrap h-auto"
                style={{
                  padding: '8px 16px',
                  borderRadius: '24px',
                  fontSize: '11px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  lineHeight: 1.4,
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

      {/* ═══ CATEGORY NAVIGATION (sticky breadcrumb) ═══ */}
      {filteredCategories && filteredCategories.length > 0 && (
        <CategoryNav
          categories={filteredCategories}
          itemCounts={categoryItemCounts}
          topOffset={0}
        />
      )}

      {/* ═══ MENU ITEMS LIST ═══ */}
      {filteredItemsByCategory.length > 0 ? (
        <div className="mt-4">
          {filteredItemsByCategory.map(
            (category, catIndex) =>
              category.items.length > 0 && (
                <section
                  key={category.id}
                  id={`cat-${category.id}`}
                  style={{ scrollMarginTop: '112px' }}
                >
                  {/* Sticky section header - sits below sticky category nav */}
                  <div
                    style={{
                      position: 'sticky',
                      top: '48px',
                      zIndex: 20,
                      backgroundColor: '#FFFFFF',
                      borderBottom: '1px solid #EEEEEE',
                      padding: '16px 16px 14px',
                    }}
                  >
                    <h2
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#1A1A1A',
                        lineHeight: 1.4,
                      }}
                    >
                      {category.name}
                    </h2>
                  </div>

                  {/* Items list */}
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      paddingTop: '12px',
                      paddingLeft: '16px',
                      paddingRight: '16px',
                    }}
                  >
                    <div>
                      {category.items.map((item: MenuItem, index: number) => {
                        const isRealtimeDisabled = disabledItemIds.has(item.id);
                        const effectiveItem = isRealtimeDisabled
                          ? { ...item, is_available: false }
                          : item;
                        return (
                          <MenuItemCard
                            key={item.id}
                            item={effectiveItem}
                            restaurantId={tenant.id}
                            priority={index < 4 && catIndex === 0}
                            category={category.name}
                            language={lang as 'fr' | 'en'}
                            currency={tenant.currency}
                            onOpenDetail={() => setSelectedItem(effectiveItem)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Spacer between sections */}
                  {catIndex < filteredItemsByCategory.length - 1 && (
                    <div className="h-5" style={{ backgroundColor: '#FFFFFF' }} />
                  )}
                </section>
              ),
          )}
        </div>
      ) : (
        <div className="text-center py-20">
          <div
            className="rounded-xl p-6 sm:p-8 max-w-sm mx-auto"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #EEEEEE',
            }}
          >
            <p className="font-medium" style={{ color: '#B0B0B0' }}>
              {t('noMenuAvailable')}
            </p>
          </div>
        </div>
      )}

      {/* ═══ FLOATING CART BAR (compact, fit-content, centered) ═══ */}
      {totalCartItems > 0 && (
        <div
          className="fixed left-0 right-0 z-40 flex justify-center px-4"
          style={{ bottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <Link
            href={`/sites/${tenant.slug}/cart`}
            className="inline-flex items-center gap-2.5 px-4 no-underline"
            style={{
              backgroundColor: '#1A1A1A',
              borderRadius: '999px',
              height: '48px',
              color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
              maxWidth: 'calc(100% - 32px)',
            }}
          >
            <ShoppingCart className="w-5 h-5 flex-shrink-0" style={{ color: '#FFFFFF' }} />
            <span
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
              }}
            >
              {t('viewCart')}
            </span>
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
              }}
            >
              {totalCartItems}
            </span>
            <span
              aria-hidden="true"
              className="inline-block rounded-full bg-white"
              style={{ width: 5, height: 5 }}
            />
            <span
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#FFFFFF',
                whiteSpace: 'nowrap',
              }}
            >
              {formatDisplayPrice(grandTotal, tenant.currency)}
            </span>
          </Link>
        </div>
      )}

      {/* ═══ MODALS ═══ */}
      <TablePicker
        isOpen={isTablePickerOpen}
        onClose={() => setIsTablePickerOpen(false)}
        onSelect={handleTableSelect}
        zones={zones}
        tables={tables}
      />

      <QRScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScan={handleQRScan}
        tables={tables}
      />

      <ItemDetailSheet
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        restaurantId={tenant.id}
        currency={tenant.currency}
      />

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        items={allItems}
        restaurantId={tenant.id}
        currency={tenant.currency}
        onOpenDetail={(item) => {
          setIsSearchOpen(false);
          setSelectedItem(item);
        }}
      />

      <BottomNav tenantSlug={tenant.slug} />
    </div>
  );
}
