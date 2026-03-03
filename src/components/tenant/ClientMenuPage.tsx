'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Search, ShoppingCart, ChevronRight, Utensils } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useCartData } from '@/contexts/CartContext';
import { Venue, Category, MenuItem, Ad, Tenant, Zone, Table, Menu } from '@/types/admin.types';
import { cn } from '@/lib/utils';
import AdsSlider from '@/components/tenant/AdsSlider';
import ClientShortcuts from '@/components/tenant/ClientShortcuts';
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import MenuItemCard from '@/components/tenant/MenuItemCard';
import CategoryNav from '@/components/tenant/CategoryNav';
import TablePicker from '@/components/tenant/TablePicker';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import type { QRScanResult } from '@/components/tenant/QRScanner';
import SearchOverlay from '@/components/tenant/SearchOverlay';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-neutral-100 rounded-lg" />,
});

// ─── Helpers ────────────────────────────────────────────

const formatPrice = (price: number, currency: string = 'XOF', locale: string = 'fr-FR') => {
  if (currency === 'XOF' || currency === 'XAF') {
    return `${price.toLocaleString(locale)} F`;
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(price);
};

const getTranslatedContent = (lang: string, fr: string, en?: string | null) => {
  return lang === 'en' && en ? en : fr;
};

// Emoji mapping for common category names
const CATEGORY_EMOJIS: Record<string, string> = {
  entrée: '🥗',
  starters: '🥗',
  'pour commencer': '🥗',
  burger: '🍔',
  burgers: '🍔',
  hamburger: '🍔',
  pizza: '🍕',
  pizzas: '🍕',
  pâtes: '🍝',
  pasta: '🍝',
  grillade: '🍖',
  grills: '🍖',
  'plat principal': '🍽️',
  'main course': '🍽️',
  végétarien: '🥬',
  vegetarian: '🥬',
  dessert: '🍰',
  desserts: '🍰',
  douceurs: '🍰',
  boisson: '🍹',
  boissons: '🍹',
  drinks: '🍹',
  cocktail: '🍸',
  cocktails: '🍸',
  apéritif: '🫒',
  café: '☕',
  coffee: '☕',
  africain: '🍲',
  african: '🍲',
  poisson: '🐟',
  fish: '🐟',
  seafood: '🦐',
  salade: '🥗',
  salad: '🥗',
  soupe: '🍲',
  soup: '🍲',
  petit_déjeuner: '🥐',
  breakfast: '🥐',
  brunch: '🥞',
  vin: '🍷',
  wine: '🍷',
  bière: '🍺',
  beer: '🍺',
};

function getCategoryEmoji(name: string): string {
  const lower = name.toLowerCase().trim();
  // Direct match
  if (CATEGORY_EMOJIS[lower]) return CATEGORY_EMOJIS[lower];
  // Partial match
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (lower.includes(key) || key.includes(lower)) return emoji;
  }
  return '🍽️';
}

// ─── Types ──────────────────────────────────────────────

interface ClientMenuPageProps {
  tenant: Tenant;
  venues: Venue[];
  menus: Menu[];
  initialMenuSlug?: string;
  initialTable?: string;
  initialVenueSlug?: string;
  categories: Category[];
  itemsByCategory: { id: string; name: string; items: MenuItem[] }[];
  ads: Ad[];
  zones: Zone[];
  tables: Table[];
}

// ─── Component ──────────────────────────────────────────

export default function ClientMenuPage({
  tenant,
  venues,
  menus,
  initialMenuSlug,
  initialTable,
  initialVenueSlug,
  categories,
  itemsByCategory,
  ads,
  zones,
  tables,
}: ClientMenuPageProps) {
  const t = useTranslations('tenant');
  const locale = useLocale();
  const lang = locale.startsWith('en') ? 'en' : 'fr';
  const { toast } = useToast();
  const { items: cartItems, grandTotal } = useCartData();
  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // ─── State ─────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState<string | null>(initialTable || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchSticky, setIsSearchSticky] = useState(false);
  const searchBarRef = useRef<HTMLDivElement>(null);

  // Menu navigation state
  const [activeMenuSlug, setActiveMenuSlug] = useState<string | null>(
    initialMenuSlug || (menus.length > 1 ? menus[0]?.slug || null : null),
  );
  const [activeSubMenuId, setActiveSubMenuId] = useState<string | null>(null);

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

  // ─── Auto-open QR on first visit (BluTable behavior) ──
  const scannerCheckRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || scannerCheckRef.current) return;
    scannerCheckRef.current = true;

    // If no table is set and no URL params, auto-open QR scanner
    const savedTable = localStorage.getItem('attabl_table');
    if (!initialTable && !savedTable) {
      const timer = setTimeout(() => setIsQRScannerOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, [initialTable]);

  // ─── Table auto-detection from URL ─────────────────────
  const [tableToastShown] = useState(() => {
    if (initialTable && typeof window !== 'undefined') {
      localStorage.setItem('attabl_table', initialTable);
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

  // ─── Restore table from localStorage ───────────────────
  useEffect(() => {
    if (!initialTable && typeof window !== 'undefined') {
      const saved = localStorage.getItem('attabl_table');
      if (saved) setTableNumber(saved);
    }
  }, [initialTable]);

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

  // ─── Realtime subscription ─────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`menu_realtime_${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'menu_items',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; is_available: boolean };
          setDisabledItemIds((prev) => {
            const next = new Set(prev);
            if (!updated.is_available) next.add(updated.id);
            else next.delete(updated.id);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [tenant.id]);

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

  // Featured items (is_featured flag)
  const featuredItems = useMemo(() => allItems.filter((item) => item.is_featured), [allItems]);

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
    localStorage.setItem('attabl_table', table.table_number);
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
        localStorage.setItem('attabl_table', result.tableNumber);
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
    <div className="flex-1 w-full bg-white min-h-screen pb-24">
      {/* ═══ STICKY HEADER — appears when scrolled past search bar ═══ */}
      <div
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          isSearchSticky
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-full pointer-events-none',
        )}
      >
        <div className="bg-white/95 backdrop-blur-lg border-b border-neutral-100">
          <div className="w-full px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400">
                  <Search className="w-[18px] h-[18px]" strokeWidth={1.5} />
                </div>
                <input
                  type="text"
                  placeholder={t('searchMenu')}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-3xl py-2.5 pl-11 pr-4 text-sm font-medium outline-none transition-all focus:ring-2 focus:border-transparent"
                  style={
                    {
                      '--tw-ring-color': 'var(--tenant-primary-10)',
                    } as React.CSSProperties
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Link
                href={`/sites/${tenant.slug}/cart`}
                className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: 'var(--tenant-primary-10)' }}
              >
                <ShoppingCart className="w-5 h-5" style={{ color: 'var(--tenant-primary)' }} />
                {totalCartItems > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                    style={{ backgroundColor: 'var(--tenant-primary)' }}
                  >
                    {totalCartItems}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MAIN HEADER ═══ */}
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tenant.logo_url ? (
              <Image
                src={tenant.logo_url}
                alt={tenant.name}
                width={120}
                height={40}
                className="h-10 w-auto object-contain"
                priority
              />
            ) : (
              <h1 className="text-xl font-bold" style={{ color: 'var(--tenant-primary)' }}>
                {tenant.name}
              </h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            {tableNumber && (
              <div className="px-3 py-1.5 bg-neutral-100 rounded-full">
                <span className="text-xs font-semibold text-neutral-700">Table {tableNumber}</span>
              </div>
            )}
            <Link
              href={`/sites/${tenant.slug}/cart`}
              className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'var(--tenant-primary-10)' }}
            >
              <ShoppingCart className="w-5 h-5" style={{ color: 'var(--tenant-primary)' }} />
              {totalCartItems > 0 && (
                <span
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: 'var(--tenant-primary)' }}
                >
                  {totalCartItems}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* ═══ SEARCH BAR (tracked for sticky) ═══ */}
      <div ref={searchBarRef} className="px-4 mb-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400">
            <Search className="w-[18px] h-[18px]" strokeWidth={1.5} />
          </div>
          <input
            type="text"
            placeholder={t('searchMenu')}
            className="w-full bg-neutral-50 border border-neutral-200 rounded-3xl py-3 pl-11 pr-4 text-sm font-medium outline-none transition-all focus:ring-2 focus:border-transparent"
            style={
              {
                '--tw-ring-color': 'var(--tenant-primary-10)',
              } as React.CSSProperties
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Inline search results */}
        {searchQuery.length >= 2 && searchResults.length > 0 && (
          <div className="mt-2 bg-white rounded-2xl border border-neutral-100 shadow-lg overflow-hidden">
            {searchResults.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedItem(item);
                  setSearchQuery('');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Utensils className="w-4 h-4 text-neutral-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 truncate">
                    {getTranslatedContent(lang, item.name, item.name_en)}
                  </p>
                </div>
                <span
                  className="text-sm font-bold flex-shrink-0"
                  style={{ color: 'var(--tenant-primary)' }}
                >
                  {formatPrice(item.price, tenant.currency, locale)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ═══ ADS BANNER ═══ */}
      {ads && ads.length > 0 && (
        <div className="px-4 mb-6">
          <AdsSlider ads={ads} />
        </div>
      )}

      {/* ═══ QUICK ACTIONS ═══ */}
      <div className="px-4">
        <ClientShortcuts
          onSearchClick={() => setIsSearchOpen(true)}
          primaryColor={tenant.primary_color || '#000000'}
        />
      </div>

      {/* ═══ VENUE CARDS (BluTable-style) ═══ */}
      {venues && venues.length > 1 && (
        <div className="px-4 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-neutral-800 tracking-tight">
              {t('ourSpaces')}
            </h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
            {/* "All" card */}
            <button
              onClick={() => setActiveVenueId(null)}
              className={cn(
                'flex-shrink-0 w-[200px] rounded-2xl overflow-hidden border-2 transition-all',
                !activeVenueId ? 'border-current shadow-md' : 'border-transparent',
              )}
              style={!activeVenueId ? { borderColor: 'var(--tenant-primary)' } : undefined}
            >
              <div className="p-4 bg-neutral-50 h-full flex flex-col items-center justify-center gap-2">
                <Utensils className="w-8 h-8 text-neutral-400" />
                <span className="text-sm font-semibold text-neutral-700">{t('allSpaces')}</span>
              </div>
            </button>
            {/* Venue cards */}
            {venues.map((venue) => (
              <button
                key={venue.id}
                onClick={() => setActiveVenueId(venue.id)}
                className={cn(
                  'flex-shrink-0 w-[200px] rounded-2xl overflow-hidden border-2 transition-all text-left',
                  activeVenueId === venue.id
                    ? 'border-current shadow-md'
                    : 'border-transparent hover:shadow-sm',
                )}
                style={
                  activeVenueId === venue.id ? { borderColor: 'var(--tenant-primary)' } : undefined
                }
              >
                <div className="h-24 bg-neutral-100 overflow-hidden">
                  {venue.image_url ? (
                    <Image
                      src={venue.image_url}
                      alt={venue.name}
                      width={200}
                      height={96}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Utensils className="w-8 h-8 text-neutral-300" />
                    </div>
                  )}
                </div>
                <div className="p-3 bg-white">
                  <p className="text-sm font-bold text-neutral-900 truncate">{venue.name}</p>
                  {venue.description && (
                    <p className="text-xs text-neutral-500 truncate mt-0.5">{venue.description}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ CATEGORY GRID (BluTable-style with emojis) ═══ */}
      {filteredCategories.length > 0 && (
        <div className="px-4 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-neutral-800 tracking-tight">
              {lang === 'fr' ? 'Explorez nos saveurs' : 'Explore our flavors'}
            </h2>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {filteredCategories.slice(0, 8).map((cat, idx) => (
              <button
                key={cat.id}
                onClick={() => {
                  const el = document.getElementById(`cat-${cat.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="text-center group"
                style={{
                  animation: `fadeInUp 0.3s ease-out ${idx * 50}ms both`,
                }}
              >
                <div className="w-[72px] h-[72px] sm:w-[80px] sm:h-[80px] mx-auto rounded-full bg-neutral-50 p-1 mb-2.5 transition-transform duration-150 group-hover:scale-105">
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center border border-neutral-100/50">
                    <span className="text-[26px] sm:text-[28px]">{getCategoryEmoji(cat.name)}</span>
                  </div>
                </div>
                <p className="text-[11px] font-medium text-neutral-600 leading-tight line-clamp-2">
                  {getTranslatedContent(lang, cat.name, cat.name_en)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FEATURED ITEMS (horizontal scroll) ═══ */}
      {featuredItems.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4 px-4">
            <h2 className="text-sm font-black text-neutral-900 uppercase tracking-[0.2em]">
              {lang === 'fr' ? 'À LA UNE' : 'FEATURED'}
            </h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-4">
            {featuredItems.map((item) => {
              const itemName = getTranslatedContent(lang, item.name, item.name_en);
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="flex-shrink-0 w-[240px] sm:w-[260px] bg-white border border-neutral-200 rounded-3xl overflow-hidden transition-all duration-500 group text-left"
                >
                  <div className="relative h-36 sm:h-40 bg-neutral-50 overflow-hidden">
                    {item.image_url && !item.image_url.includes('placeholder') ? (
                      <Image
                        src={item.image_url}
                        alt={itemName}
                        fill
                        sizes="260px"
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Utensils className="w-10 h-10 text-neutral-200" />
                      </div>
                    )}
                    <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/20 shadow-sm">
                      <span
                        className="text-[11px] font-black whitespace-nowrap"
                        style={{ color: 'var(--tenant-primary)' }}
                      >
                        {formatPrice(item.price, tenant.currency, locale)}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-bold text-neutral-900 mb-0.5 line-clamp-1 transition-colors group-hover:text-neutral-600">
                      {itemName}
                    </h3>
                    <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">
                      {item.category?.name || ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ MENU TABS (multiple menus) ═══ */}
      {filteredMenus.length > 1 && (
        <div className="px-4 mb-3">
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4" data-tab-pane>
            {filteredMenus.map((menu) => (
              <button
                key={menu.slug}
                onClick={() => handleMenuChange(menu.slug)}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap',
                  activeMenuSlug === menu.slug
                    ? 'text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
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
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
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
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
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
        <CategoryNav categories={filteredCategories} />
      )}

      {/* ═══ MENU ITEMS LIST ═══ */}
      {filteredItemsByCategory.length > 0 ? (
        <div className="mt-4">
          {filteredItemsByCategory.map(
            (category) =>
              category.items.length > 0 && (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-32">
                  <div className="flex items-center gap-3 mb-1 px-4 pt-6 pb-2">
                    <h2 className="text-sm font-bold text-neutral-400 uppercase tracking-widest">
                      {category.name}
                    </h2>
                    <div className="h-px bg-neutral-100 flex-1" />
                  </div>
                  <div className="divide-y divide-neutral-100">
                    {category.items.map((item: MenuItem) => {
                      const isRealtimeDisabled = disabledItemIds.has(item.id);
                      const effectiveItem = isRealtimeDisabled
                        ? { ...item, is_available: false }
                        : item;
                      return (
                        <MenuItemCard
                          key={item.id}
                          item={effectiveItem}
                          restaurantId={tenant.id}
                          category={category.name}
                          language={lang as 'fr' | 'en'}
                          currency={tenant.currency}
                          onOpenDetail={() => setSelectedItem(effectiveItem)}
                        />
                      );
                    })}
                  </div>
                </section>
              ),
          )}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm mx-auto">
            <p className="text-neutral-500 font-medium">{t('noMenuAvailable')}</p>
          </div>
        </div>
      )}

      {/* ═══ FLOATING CART PREVIEW BAR ═══ */}
      {totalCartItems > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-40 max-w-lg mx-auto">
          <Link
            href={`/sites/${tenant.slug}/cart`}
            className="flex items-center justify-between w-full px-5 py-3.5 rounded-2xl text-white shadow-xl transition-transform active:scale-[0.98]"
            style={{ backgroundColor: 'var(--tenant-primary)' }}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm">
                {totalCartItems} {totalCartItems > 1 ? 'articles' : 'article'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">
                {formatPrice(grandTotal, tenant.currency, locale)}
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

      <InstallPrompt appName={tenant.name} logoUrl={tenant.logo_url} />

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

      <BottomNav
        tenantSlug={tenant.slug}
        primaryColor={tenant.primary_color || '#000000'}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
