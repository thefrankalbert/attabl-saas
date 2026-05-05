'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Search, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Venue, Category, MenuItem, Tenant, Zone, Table, Menu } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CategoryNav from '@/components/tenant/CategoryNav';
import TablePicker from '@/components/tenant/TablePicker';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { QRScanResult } from '@/components/tenant/QRScanner';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-[#F6F6F6]" />,
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
  initialItemId?: string;
  categories: Category[];
  itemsByCategory: { id: string; name: string; name_en?: string; items: MenuItem[] }[];
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
  initialItemId,
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
  const { resolveAndFormatPrice } = useDisplayCurrency();

  // ─── State ─────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
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

  const [isMenuSheetOpen, setIsMenuSheetOpen] = useState(false);

  // ─── Persist table from URL param to localStorage ───────
  useEffect(() => {
    if (initialTable) {
      localStorage.setItem(`attabl_${tenant.slug}_table`, initialTable);
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
    let t2: ReturnType<typeof setTimeout> | null = null;
    const t1 = setTimeout(() => {
      if (!scrollToCategory()) {
        t2 = setTimeout(scrollToCategory, 600);
      }
    }, 300);

    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [initialSection, categories]);

  // ─── Open item detail from URL param ──────────────────
  useEffect(() => {
    if (!initialItemId) return;
    for (const group of itemsByCategory) {
      const found = group.items.find((i) => i.id === initialItemId);
      if (found) {
        setSelectedItem(found);
        return;
      }
    }
  }, [initialItemId, itemsByCategory]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reset menu only when venue changes, not on every filteredMenus/activeMenuSlug mutation (2026-05-04)
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
    for (const cat of menuFilteredByCategory) {
      counts[cat.id] = cat.items.length;
    }
    return counts;
  }, [menuFilteredByCategory]);

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

  // ─── Render ──────────────────────────────────────────
  return (
    <div
      className="flex-1 w-full bg-white"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ═══ HEADER (two rows) ═══ */}
      <div className="sticky top-0 z-40 bg-white border-b border-[#EEEEEE]">
        {/* Row 1: navigation + identity + cart */}
        <div className="px-3 pt-2 pb-1.5 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/sites/${tenant.slug}`)}
            className="w-9 h-9 rounded-full bg-app-elevated flex-shrink-0"
            aria-label={t('ariaGoBack')}
          >
            <ChevronLeft className="w-5 h-5 text-[#1A1A1A]" />
          </Button>
          <h1 className="flex-1 text-center text-[15px] font-bold text-[#1A1A1A] truncate">
            {tenant.name}
          </h1>
          <div className="w-9 flex-shrink-0" />
        </div>
        {/* Row 2: composite search bar (selector prefix + search input) */}
        <div className="px-3 pb-2">
          <div className="flex items-center bg-[#F6F6F6] rounded-[10px] h-9 overflow-hidden">
            {((!hideVenueRow && venues.length > 1) ||
              (filteredMenus.length > 1 && !hideMenuTabsRow)) && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setIsMenuSheetOpen(true)}
                  className="flex items-center gap-1 h-full pl-3 pr-2 flex-shrink-0 rounded-none hover:bg-transparent focus-visible:ring-0"
                  aria-haspopup="dialog"
                  aria-label={t('sheetMenuTitle')}
                >
                  <span className="text-[12px] font-medium text-[#1A1A1A] truncate max-w-[80px]">
                    {filteredMenus.length > 1 && !hideMenuTabsRow && activeMenu
                      ? activeMenu.name
                      : activeVenueId
                        ? (venues.find((v) => v.id === activeVenueId)?.name ?? t('allFilter'))
                        : t('allFilter')}
                  </span>
                  <ChevronDown className="w-3 h-3 flex-shrink-0 text-[#1A1A1A]" />
                </Button>
                <div className="w-px h-4 bg-[#DDDDDD] flex-shrink-0" />
              </>
            )}
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#B0B0B0]">
                <Search className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <Input
                type="text"
                placeholder={t('searchMenu')}
                className="w-full pl-9 pr-3 text-sm font-medium outline-none border-0 shadow-none focus-visible:ring-0 bg-transparent rounded-none h-9 text-[#1A1A1A]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ SEARCH RESULTS OVERLAY ═══ */}
      {searchQuery.length >= 2 && (
        <div className="fixed inset-x-0 top-[94px] bottom-0 z-[35] bg-white overflow-y-auto">
          <div className="px-4 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
            {searchResults.length === 0 && (
              <p className="text-center text-sm py-8 text-[#B0B0B0]">
                {t('noSearchResults', { query: searchQuery })}
              </p>
            )}
            {searchResults.length > 0 && (
              <div className="rounded-xl overflow-hidden bg-white border border-[#EEEEEE] shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                <div className="p-2">
                  <h3 className="px-3 py-2 text-[11px] font-medium text-[#B0B0B0] uppercase tracking-[1px]">
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
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left justify-start h-auto hover:bg-[#F6F6F6]"
                    >
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="text-sm font-bold text-[#1A1A1A] truncate">
                          {lang === 'en' && item.name_en ? item.name_en : item.name}
                        </p>
                      </div>
                      <span className="text-sm font-bold flex-shrink-0 text-[#1A1A1A]">
                        {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#B0B0B0]" />
                    </Button>
                  ))}
                </div>
              </div>
            )}
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
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto text-[11px] font-medium uppercase tracking-[1px]',
                  !activeSubMenuId ? 'bg-[#1A1A1A] text-white' : 'bg-[#F6F6F6] text-[#B0B0B0]',
                )}
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
                    className={cn(
                      'flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto text-[11px] font-medium uppercase tracking-[1px]',
                      activeSubMenuId === child.id
                        ? 'bg-[#1A1A1A] text-white'
                        : 'bg-[#F6F6F6] text-[#B0B0B0]',
                    )}
                  >
                    {child.name}
                  </Button>
                ))}
              {transversalMenus.map((tm) => (
                <Button
                  key={tm.slug}
                  variant="ghost"
                  onClick={() => setActiveSubMenuId(tm.id)}
                  className={cn(
                    'flex-shrink-0 px-4 py-2 rounded-full whitespace-nowrap h-auto text-[11px] font-medium uppercase tracking-[1px]',
                    activeSubMenuId === tm.id
                      ? 'bg-[#1A1A1A] text-white'
                      : 'bg-[#F6F6F6] text-[#B0B0B0]',
                  )}
                >
                  {lang === 'en' && tm.name_en ? tm.name_en : tm.name}
                </Button>
              ))}
            </div>
          </div>
        )}

      {/* ═══ CATEGORY NAVIGATION (sticky breadcrumb) ═══ */}
      {filteredCategories && filteredCategories.length > 0 && (
        <CategoryNav
          categories={filteredCategories}
          itemCounts={categoryItemCounts}
          topOffset={94}
        />
      )}

      {/* ═══ MENU ITEMS LIST ═══ */}
      {menuFilteredByCategory.length > 0 ? (
        <div className="mt-4">
          {menuFilteredByCategory.map(
            (category, catIndex) =>
              category.items.length > 0 && (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-[150px]">
                  {/* Sticky section header - sits below sticky search header (56px) + category nav (48px) */}
                  <div className="sticky top-[142px] z-20 bg-white border-b border-[#EEEEEE] px-4 pt-4 pb-[14px]">
                    <h2 className="text-[20px] font-bold text-[#1A1A1A] leading-[1.4]">
                      {category.name}
                    </h2>
                  </div>

                  {/* Items list */}
                  <div className="bg-white pt-3 px-4">
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
                  {catIndex < menuFilteredByCategory.length - 1 && <div className="h-5 bg-white" />}
                </section>
              ),
          )}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="rounded-xl p-6 sm:p-8 max-w-sm mx-auto bg-white border border-[#EEEEEE]">
            <p className="font-medium text-[#B0B0B0]">{t('noMenuAvailable')}</p>
          </div>
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

      <Sheet open={isMenuSheetOpen} onOpenChange={setIsMenuSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="text-left mb-4">
            <SheetTitle>{t('sheetMenuTitle')}</SheetTitle>
          </SheetHeader>
          {filteredMenus.length > 1 && !hideMenuTabsRow && (
            <div className="mb-4">
              <p className="text-[11px] font-medium text-[#B0B0B0] uppercase tracking-[1px] mb-2">
                {t('sheetMenuSection')}
              </p>
              <div className="flex flex-col gap-1">
                {filteredMenus.map((menu) => (
                  <Button
                    key={menu.slug}
                    variant="ghost"
                    onClick={() => {
                      handleMenuChange(menu.slug);
                      setIsMenuSheetOpen(false);
                    }}
                    className={cn(
                      'justify-between h-11 px-3 rounded-xl',
                      activeMenuSlug === menu.slug
                        ? 'bg-[#F6F6F6] font-semibold text-[#1A1A1A]'
                        : 'text-[#737373]',
                    )}
                  >
                    <span className="truncate">{menu.name}</span>
                    {activeMenuSlug === menu.slug && <Check className="w-4 h-4 flex-shrink-0" />}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {venues.length > 1 && !hideVenueRow && (
            <div>
              <p className="text-[11px] font-medium text-[#B0B0B0] uppercase tracking-[1px] mb-2">
                {t('sheetVenueSection')}
              </p>
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setActiveVenueId(null);
                    setIsMenuSheetOpen(false);
                  }}
                  className={cn(
                    'justify-between h-11 px-3 rounded-xl',
                    !activeVenueId ? 'bg-[#F6F6F6] font-semibold text-[#1A1A1A]' : 'text-[#737373]',
                  )}
                >
                  {t('allFilter')}
                  {!activeVenueId && <Check className="w-4 h-4" />}
                </Button>
                {venues.map((venue) => (
                  <Button
                    key={venue.id}
                    variant="ghost"
                    onClick={() => {
                      setActiveVenueId(venue.id);
                      setIsMenuSheetOpen(false);
                    }}
                    className={cn(
                      'justify-between h-11 px-3 rounded-xl',
                      activeVenueId === venue.id
                        ? 'bg-[#F6F6F6] font-semibold text-[#1A1A1A]'
                        : 'text-[#737373]',
                    )}
                  >
                    <span className="truncate">{venue.name}</span>
                    {activeVenueId === venue.id && <Check className="w-4 h-4 flex-shrink-0" />}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
