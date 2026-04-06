'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import BottomNav from '@/components/tenant/BottomNav';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CategoryNav from '@/components/tenant/CategoryNav';
import TablePicker from '@/components/tenant/TablePicker';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import type { QRScanResult } from '@/components/tenant/QRScanner';
import SearchOverlay from '@/components/tenant/SearchOverlay';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-app-elevated rounded-lg" />,
});

// ─── Helpers ────────────────────────────────────────────

// formatPrice is now handled by useDisplayCurrency().formatDisplayPrice

// ─── Types ──────────────────────────────────────────────

interface ClientMenuDetailPageProps {
  tenant: Tenant;
  venues: Venue[];
  menus: Menu[];
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
  const [isSearchSticky, setIsSearchSticky] = useState(false);
  const searchBarRef = useRef<HTMLDivElement>(null);

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

  // ─── Sticky search on scroll ───────────────────────────
  const handleScroll = useCallback(() => {
    if (searchBarRef.current) {
      const rect = searchBarRef.current.getBoundingClientRect();
      setIsSearchSticky(rect.top <= 0);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

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
  const filteredItemsByCategory =
    menus.length <= 1
      ? itemsByCategory
      : itemsByCategory.filter((cat) => {
          if (!activeMenu) return true;
          const activeMenuIds = [activeMenu.id, ...(activeMenu.children?.map((c) => c.id) || [])];
          if (activeSubMenuId) {
            const category = categories.find((c) => c.id === cat.id);
            return category?.menu_id === activeSubMenuId;
          }
          const category = categories.find((c) => c.id === cat.id);
          return !category?.menu_id || activeMenuIds.includes(category.menu_id);
        });

  // Filter categories for CategoryNav
  const filteredCategories =
    menus.length <= 1
      ? categories
      : categories.filter((c) => {
          if (!activeMenu) return true;
          const activeMenuIds = [activeMenu.id, ...(activeMenu.children?.map((ch) => ch.id) || [])];
          if (activeSubMenuId) return c.menu_id === activeSubMenuId;
          return !c.menu_id || activeMenuIds.includes(c.menu_id);
        });

  const allItems = useMemo(() => itemsByCategory.flatMap((cat) => cat.items), [itemsByCategory]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const lower = searchQuery.toLowerCase();
    return allItems
      .filter((item) => {
        const name = (item.name || '').toLowerCase();
        const nameEn = (item.name_en || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        return name.includes(lower) || nameEn.includes(lower) || desc.includes(lower);
      })
      .slice(0, 8);
  }, [allItems, searchQuery]);

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
  };

  // ─── Render ────────────────────────────────────────────
  return (
    <div
      className="flex-1 w-full"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ═══ STICKY HEADER - appears when scrolled past search bar ═══ */}
      {isSearchSticky && (
        <div className="fixed top-0 left-0 right-0 z-50">
          <div className="bg-app-card border-b border-app-border">
            <div className="w-full p-3 px-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-app-text-muted">
                    <Search className="w-[18px] h-[18px]" strokeWidth={1.5} />
                  </div>
                  <input
                    type="text"
                    placeholder={t('searchMenu')}
                    className="w-full bg-app-elevated border border-app-border rounded-3xl py-2.5 pl-11 pr-4 text-sm font-medium text-app-text outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Link
                  href={`/sites/${tenant.slug}/cart`}
                  className="relative w-10 h-10 rounded-full flex items-center justify-center text-app-text-muted no-underline"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {totalCartItems > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-app-card">
                      {totalCartItems}
                    </span>
                  )}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PAGE HEADER ═══ */}
      <div className="p-4 flex items-center gap-3 bg-app-card border-b border-app-border">
        <button
          onClick={() => router.push(`/sites/${tenant.slug}`)}
          className="w-9 h-9 rounded-full bg-app-elevated flex items-center justify-center border-none cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 text-app-text" />
        </button>
        <h1 className="text-lg font-bold text-app-text flex-1">{t('ourMenu')}</h1>
        <Link
          href={`/sites/${tenant.slug}/cart`}
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-app-text-muted no-underline"
        >
          <ShoppingCart className="w-5 h-5" />
          {totalCartItems > 0 && (
            <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-app-card">
              {totalCartItems}
            </span>
          )}
        </Link>
      </div>

      {/* ═══ SEARCH BAR ═══ */}
      <div ref={searchBarRef} className="py-3 px-4 bg-app-card sm:px-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-app-text-muted">
            <Search className="w-[18px] h-[18px]" strokeWidth={1.5} />
          </div>
          <input
            type="text"
            placeholder={t('searchMenu')}
            className="w-full bg-app-elevated border border-app-border rounded-3xl py-2.5 pl-11 pr-4 text-sm font-medium text-app-text outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Inline search results */}
        {searchQuery.length >= 2 && searchResults.length === 0 && (
          <p className="text-center text-sm text-app-text-muted py-8">
            Aucun plat trouve pour &quot;{searchQuery}&quot;
          </p>
        )}
        {searchQuery.length >= 2 && searchResults.length > 0 && (
          <div className="mt-2 bg-app-card rounded-2xl border border-app-border shadow-lg overflow-hidden z-50 relative">
            <div className="p-2">
              <h3 className="text-[10px] font-bold text-app-text-muted uppercase tracking-widest px-3 py-2">
                {t('dishesFound')}
              </h3>
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedItem(item);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-app-elevated rounded-xl transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-app-text">
                      {lang === 'en' && item.name_en ? item.name_en : item.name}
                    </p>
                  </div>
                  <span
                    className="text-sm font-bold flex-shrink-0"
                    style={{ color: 'var(--tenant-primary)' }}
                  >
                    {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-app-text-muted" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ VENUE FILTER PILLS ═══ */}
      {venues && venues.length > 1 && (
        <div className="px-4 pb-3 bg-app-card flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveVenueId(null)}
            className={cn(
              'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap border-none cursor-pointer',
              !activeVenueId ? 'text-white' : 'bg-app-elevated text-app-text-secondary',
            )}
            style={!activeVenueId ? { backgroundColor: 'var(--tenant-primary)' } : undefined}
          >
            {t('allFilter')}
          </button>
          {venues.map((venue) => (
            <button
              key={venue.id}
              onClick={() => setActiveVenueId(venue.id)}
              className={cn(
                'flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap border-none cursor-pointer',
                activeVenueId === venue.id
                  ? 'text-white'
                  : 'bg-app-elevated text-app-text-secondary',
              )}
              style={
                activeVenueId === venue.id
                  ? { backgroundColor: 'var(--tenant-primary)' }
                  : undefined
              }
            >
              {venue.name}
            </button>
          ))}
        </div>
      )}

      {/* ═══ MENU TABS (multiple menus) ═══ */}
      {filteredMenus.length > 1 && (
        <div className="px-4 mb-3">
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide" data-tab-pane>
            {filteredMenus.map((menu) => (
              <button
                key={menu.slug}
                onClick={() => handleMenuChange(menu.slug)}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap border-none cursor-pointer',
                  activeMenuSlug === menu.slug
                    ? 'text-white'
                    : 'bg-app-elevated text-app-text-secondary',
                )}
                style={
                  activeMenuSlug === menu.slug
                    ? { backgroundColor: 'var(--tenant-primary)' }
                    : undefined
                }
              >
                {menu.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SUB-MENU TABS ═══ */}
      {activeMenu?.children && activeMenu.children.length > 0 && (
        <div className="px-4 mb-3">
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
            <button
              onClick={() => setActiveSubMenuId(null)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                !activeSubMenuId
                  ? 'text-white'
                  : 'bg-app-elevated text-app-text-muted hover:bg-app-bg',
              )}
              style={!activeSubMenuId ? { backgroundColor: 'var(--tenant-primary)' } : undefined}
            >
              {t('all')}
            </button>
            {activeMenu.children
              .filter((c) => c.is_active)
              .map((child) => (
                <button
                  key={child.slug}
                  onClick={() => setActiveSubMenuId(child.id)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                    activeSubMenuId === child.id
                      ? 'text-white'
                      : 'bg-app-elevated text-app-text-muted hover:bg-app-bg',
                  )}
                  style={
                    activeSubMenuId === child.id
                      ? { backgroundColor: 'var(--tenant-primary)' }
                      : undefined
                  }
                >
                  {child.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* ═══ CATEGORY NAVIGATION (sticky pills) ═══ */}
      {filteredCategories && filteredCategories.length > 0 && (
        <CategoryNav categories={filteredCategories} visible={isSearchSticky} />
      )}

      {/* ═══ MENU ITEMS LIST ═══ */}
      {filteredItemsByCategory.length > 0 ? (
        <div className="mt-4">
          {filteredItemsByCategory.map(
            (category, catIndex) =>
              category.items.length > 0 && (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-[120px]">
                  {/* Section header */}
                  <div className="p-4 bg-app-bg">
                    <h2 className="text-lg font-bold text-app-text dark:text-app-text uppercase tracking-tight">
                      {category.name}
                    </h2>
                  </div>

                  {/* Items list */}
                  <div className="bg-app-card border-y border-app-border">
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
                    <div className="h-4 bg-app-bg" />
                  )}
                </section>
              ),
          )}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="bg-app-card rounded-2xl shadow-sm p-8 max-w-sm mx-auto">
            <p className="text-app-text-muted font-medium">{t('noMenuAvailable')}</p>
          </div>
        </div>
      )}

      {/* ═══ FLOATING CART BAR ═══ */}
      {totalCartItems > 0 && (
        <div className="fixed bottom-18 left-4 right-4 z-40 max-w-lg mx-auto">
          <Link
            href={`/sites/${tenant.slug}/cart`}
            className="flex items-center justify-between w-full py-3.5 px-5 rounded-2xl text-white no-underline shadow-xl"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm">
                {t('cartItemCount', { count: totalCartItems })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">
                {formatDisplayPrice(grandTotal, tenant.currency)}
              </span>
              <ChevronRight className="w-4 h-4" />
            </div>
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
