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

  // Menu navigation state — auto-select menu containing the target section
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
      className="flex-1 w-full min-h-screen"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ═══ STICKY HEADER — appears when scrolled past search bar ═══ */}
      {isSearchSticky && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
          <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ width: '100%', padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: 0,
                      paddingLeft: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none',
                      color: '#9ca3af',
                    }}
                  >
                    <Search style={{ width: '18px', height: '18px' }} strokeWidth={1.5} />
                  </div>
                  <input
                    type="text"
                    placeholder={t('searchMenu')}
                    style={{
                      width: '100%',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '24px',
                      padding: '10px 16px 10px 44px',
                      fontSize: '14px',
                      fontWeight: 500,
                      outline: 'none',
                    }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Link
                  href={`/sites/${tenant.slug}/cart`}
                  style={{
                    position: 'relative',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    textDecoration: 'none',
                  }}
                >
                  <ShoppingCart style={{ width: '20px', height: '20px' }} />
                  {totalCartItems > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #fff',
                      }}
                    >
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
      <div
        style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #f3f4f6',
        }}
      >
        <button
          onClick={() => router.push(`/sites/${tenant.slug}`)}
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <ChevronLeft style={{ width: '20px', height: '20px', color: '#374151' }} />
        </button>
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', flex: 1 }}>
          {t('ourMenu')}
        </h1>
        <Link
          href={`/sites/${tenant.slug}/cart`}
          style={{
            position: 'relative',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6b7280',
            textDecoration: 'none',
          }}
        >
          <ShoppingCart style={{ width: '20px', height: '20px' }} />
          {totalCartItems > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                color: '#fff',
                fontSize: '9px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #fff',
              }}
            >
              {totalCartItems}
            </span>
          )}
        </Link>
      </div>

      {/* ═══ SEARCH BAR ═══ */}
      <div
        ref={searchBarRef}
        style={{ padding: '12px 16px 12px', backgroundColor: '#ffffff' }}
        className="sm:px-6"
      >
        <div style={{ position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              paddingLeft: '16px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: '#9ca3af',
            }}
          >
            <Search style={{ width: '18px', height: '18px' }} strokeWidth={1.5} />
          </div>
          <input
            type="text"
            placeholder={t('searchMenu')}
            style={{
              width: '100%',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '24px',
              padding: '10px 16px 10px 44px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#374151',
              outline: 'none',
            }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Inline search results */}
        {searchQuery.length >= 2 && searchResults.length > 0 && (
          <div className="mt-2 bg-app-card rounded-2xl border border-app-border shadow-lg overflow-hidden z-50 relative">
            <div className="p-2">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 py-2">
                {t('dishesFound')}
              </h3>
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedItem(item);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 hover:bg-gray-50 rounded-xl transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">
                      {lang === 'en' && item.name_en ? item.name_en : item.name}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-[#C5A065] flex-shrink-0">
                    {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ VENUE FILTER PILLS ═══ */}
      {venues && venues.length > 1 && (
        <div
          style={{
            padding: '0 16px 12px',
            backgroundColor: '#ffffff',
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
          }}
          className="scrollbar-hide"
        >
          <button
            onClick={() => setActiveVenueId(null)}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: !activeVenueId ? '#002C5F' : '#f3f4f6',
              color: !activeVenueId ? '#ffffff' : '#4b5563',
            }}
          >
            {t('allFilter')}
          </button>
          {venues.map((venue) => (
            <button
              key={venue.id}
              onClick={() => setActiveVenueId(venue.id)}
              style={{
                flexShrink: 0,
                padding: '6px 14px',
                borderRadius: '9999px',
                fontSize: '13px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: activeVenueId === venue.id ? '#002C5F' : '#f3f4f6',
                color: activeVenueId === venue.id ? '#ffffff' : '#4b5563',
              }}
            >
              {venue.name}
            </button>
          ))}
        </div>
      )}

      {/* ═══ MENU TABS (multiple menus) ═══ */}
      {filteredMenus.length > 1 && (
        <div style={{ padding: '0 16px', marginBottom: '12px' }}>
          <div
            style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px' }}
            className="scrollbar-hide"
            data-tab-pane
          >
            {filteredMenus.map((menu) => (
              <button
                key={menu.slug}
                onClick={() => handleMenuChange(menu.slug)}
                style={{
                  flexShrink: 0,
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  fontSize: '14px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: activeMenuSlug === menu.slug ? '#002C5F' : '#f3f4f6',
                  color: activeMenuSlug === menu.slug ? '#ffffff' : '#4b5563',
                }}
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
                  ? 'bg-[#002C5F] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              )}
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
                      ? 'bg-[#002C5F] text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                  )}
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
        <div style={{ marginTop: '16px' }}>
          {filteredItemsByCategory.map(
            (category, catIndex) =>
              category.items.length > 0 && (
                <section
                  key={category.id}
                  id={`cat-${category.id}`}
                  style={{ scrollMarginTop: '120px' }}
                >
                  {/* Section header */}
                  <div style={{ padding: '16px', backgroundColor: '#F8FAFC' }}>
                    <h2
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#003058',
                        textTransform: 'uppercase',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {category.name}
                    </h2>
                  </div>

                  {/* Items list */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderTop: '1px solid #f3f4f6',
                      borderBottom: '1px solid #f3f4f6',
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
                    <div className="h-4 bg-[#F8FAFC]" />
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
        <div
          style={{
            position: 'fixed',
            bottom: '72px',
            left: '16px',
            right: '16px',
            zIndex: 40,
            maxWidth: '512px',
            margin: '0 auto',
          }}
        >
          <Link
            href={`/sites/${tenant.slug}/cart`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '14px 20px',
              borderRadius: '16px',
              color: '#ffffff',
              backgroundColor: '#14b8a6',
              textDecoration: 'none',
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShoppingCart style={{ width: '16px', height: '16px' }} />
              </div>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>
                {t('cartItemCount', { count: totalCartItems })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '14px' }}>
                {formatDisplayPrice(grandTotal, tenant.currency)}
              </span>
              <ChevronRight style={{ width: '16px', height: '16px' }} />
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
