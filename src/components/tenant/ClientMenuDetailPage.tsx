'use client';

import { useState, useEffect, useMemo, useCallback, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Search, ChevronLeft, ChevronRight, Check, MapPin, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Venue, Category, MenuItem, Tenant, Zone, Table, Menu } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import { noopSubscribe } from '@/lib/utils/noop-subscribe';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CategoryNav from '@/components/tenant/CategoryNav';
import TablePicker from '@/components/tenant/TablePicker';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// - Helpers -

// formatPrice is now handled by useDisplayCurrency().formatDisplayPrice

// - Types -

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

// - Component -

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

  // - State -
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Table number (localStorage, hydration-safe) for the header subtitle.
  const tableNum = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(`attabl_${tenant.slug}_table`);
      } catch {
        return null;
      }
    },
    () => null,
  );

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
  // Active category for the single sticky title bar (synced with CategoryNav).
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');

  const [isMenuSheetOpen, setIsMenuSheetOpen] = useState(false);

  // - Persist table from URL param to localStorage -
  useEffect(() => {
    if (initialTable) {
      localStorage.setItem(`attabl_${tenant.slug}_table`, initialTable);
    }
  }, [initialTable, tenant.slug]);

  // - Scroll to section on mount -
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

  // - Open item detail from URL param -
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

  // Realtime subscriptions.
  // Availability toggles (the most frequent staff action) are applied to local
  // state incrementally - no server round-trip, no full re-render. Structural
  // changes (item add/remove, category edits) still need the full cached menu
  // payload (with modifiers) re-fetched from the server, but we DEBOUNCE that
  // refresh so a burst of staff edits collapses into a single refresh per
  // device instead of one full server re-render per row changed.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      router.refresh();
    }, 1500);
  }, [router]);

  // Clear any pending debounced refresh on unmount (no leaked timer).
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);

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
    onInsert: scheduleRealtimeRefresh,
    onDelete: scheduleRealtimeRefresh,
  });

  useRealtimeSubscription({
    channelName: `categories_realtime_${tenant.id}`,
    table: 'categories',
    filter: `tenant_id=eq.${tenant.id}`,
    onChange: scheduleRealtimeRefresh,
  });

  // - Filtering logic -

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

  // - Handlers -

  const handleTableSelect = (table: Table) => {
    localStorage.setItem(`attabl_${tenant.slug}_table`, table.table_number);
    toast({
      title: t('tableSelected'),
      description: t('seatedAtTable', { table: table.table_number }),
    });
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

  // - Render -
  const headerVenueLabel = activeVenueId
    ? (venues.find((v) => v.id === activeVenueId)?.name ?? null)
    : null;
  const headerSubtitle = [tableNum ? t('tableLabel', { num: tableNum }) : null, headerVenueLabel]
    .filter(Boolean)
    .join(' - ');

  const toggleSearch = () => {
    setShowSearch((s) => !s);
    setSearchQuery('');
  };

  const canSwitchMenu = filteredMenus.length > 1 || venues.length > 1;
  const headerTitleInner = (
    <>
      <h1 className="text-[16px] font-semibold leading-[1.15] tracking-[-0.4px] text-[#1A1A1A] truncate">
        {t('menuTitle')} {tenant.name}
      </h1>
      {headerSubtitle && (
        <div className="mt-px flex items-center gap-1 text-[11.5px] text-[#737373]">
          <MapPin className="w-[11px] h-[11px] flex-shrink-0" strokeWidth={2} />
          <span className="truncate">{headerSubtitle}</span>
        </div>
      )}
    </>
  );

  return (
    <div
      className="flex-1 w-full bg-white"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* - HEADER - */}
      <div className="sticky top-0 z-40 bg-white border-b border-[#EEEEEE]">
        {/* Row 1: back + title/subtitle + search toggle */}
        <div className="px-[14px] py-3 flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/sites/${tenant.slug}`)}
            className="w-[38px] h-[38px] rounded-full bg-app-elevated flex-shrink-0"
            aria-label={t('ariaGoBack')}
          >
            <ChevronLeft className="w-5 h-5 text-[#1A1A1A]" />
          </Button>
          {canSwitchMenu ? (
            <Button
              variant="ghost"
              onClick={() => setIsMenuSheetOpen(true)}
              aria-haspopup="dialog"
              aria-label={t('sheetMenuTitle')}
              className="flex h-auto min-w-0 flex-1 flex-col items-start gap-0 p-0 text-left hover:bg-transparent"
            >
              {headerTitleInner}
            </Button>
          ) : (
            <div className="min-w-0 flex-1">{headerTitleInner}</div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSearch}
            className="w-[38px] h-[38px] rounded-full flex-shrink-0"
            aria-label={t('searchMenu')}
          >
            {showSearch ? (
              <X className="w-5 h-5 text-[#1A1A1A]" />
            ) : (
              <Search className="w-5 h-5 text-[#1A1A1A]" />
            )}
          </Button>
        </div>
        {/* Row 2: search input (toggled by the header icon) */}
        {showSearch && (
          <div className="px-3 pb-2">
            <div className="flex h-10 items-center gap-2.5 rounded-[var(--radius-search)] border border-[#EEEEEE] bg-[#F6F6F6] px-3">
              <Search className="w-[17px] h-[17px] flex-shrink-0 text-[#737373]" strokeWidth={2} />
              <Input
                autoFocus
                type="text"
                placeholder={t('searchMenu')}
                className="h-auto flex-1 border-0 bg-transparent p-0 text-[14px] font-medium shadow-none focus-visible:ring-0 text-[#1A1A1A]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchQuery('')}
                  aria-label={t('clearSearch')}
                  className="w-[18px] h-[18px] shrink-0 rounded-full bg-[#1A1A1A] p-0 hover:bg-[#1A1A1A]"
                >
                  <X className="w-[11px] h-[11px] text-white" strokeWidth={2.6} />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* - SEARCH RESULTS OVERLAY - */}
      {searchQuery.length >= 2 && (
        <div className="fixed inset-x-0 top-[63px] bottom-0 z-[35] bg-white overflow-y-auto">
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

      {/* - SUB-MENU TABS - */}
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

      {/* - CATEGORY NAVIGATION (sticky breadcrumb) - */}
      {filteredCategories && filteredCategories.length > 0 && (
        <CategoryNav
          categories={filteredCategories}
          topOffset={63}
          onActiveChange={setActiveCategoryId}
        />
      )}

      {/* Single sticky category title bar - reflects the active category (synced
          with the chips). Replaces per-section sticky headers, which overlapped
          and flashed the next title on short adjacent categories. */}
      {menuFilteredByCategory.length > 0 && (
        <div className="sticky top-[111px] z-20 border-b border-[#EEEEEE] bg-white px-4 pt-4 pb-[14px]">
          <h2 className="text-[20px] font-bold leading-[1.4] tracking-[-0.6px] text-[#1A1A1A]">
            {
              (
                menuFilteredByCategory.find((c) => c.id === activeCategoryId) ??
                menuFilteredByCategory[0]
              )?.name
            }
          </h2>
        </div>
      )}

      {/* - MENU ITEMS LIST - */}
      {menuFilteredByCategory.length > 0 ? (
        <div>
          {menuFilteredByCategory.map(
            (category, catIndex) =>
              category.items.length > 0 && (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-[170px]">
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

      {/* - MODALS - */}
      <TablePicker
        isOpen={isTablePickerOpen}
        onClose={() => setIsTablePickerOpen(false)}
        onSelect={handleTableSelect}
        zones={zones}
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
