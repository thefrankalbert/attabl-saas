'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Search, ShoppingCart, Utensils, ChevronRight, Bell, Heart } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCartData } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import {
  Venue,
  Category,
  Ad,
  Tenant,
  Zone,
  Table,
  Announcement,
  MenuItem,
} from '@/types/admin.types';
import { cn } from '@/lib/utils';
import AdsSlider from '@/components/tenant/AdsSlider';
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import FullscreenSplash from '@/components/tenant/FullscreenSplash';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import TablePicker from '@/components/tenant/TablePicker';
import type { QRScanResult } from '@/components/tenant/QRScanner';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-app-elevated rounded-2xl" />,
});

// ─── Helpers ────────────────────────────────────────────

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
  'du grill': '🍖',
  'plat principal': '🍽️',
  'main course': '🍽️',
  plats: '🍽️',
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
  'plats africains': '🍲',
  poisson: '🐟',
  fish: '🐟',
  seafood: '🦐',
  salade: '🥗',
  salad: '🥗',
  soupe: '🍲',
  soup: '🍲',
  vin: '🍷',
  wine: '🍷',
  bière: '🍺',
  beer: '🍺',
};

function getCategoryEmoji(name: string): string {
  const lower = name.toLowerCase().trim();
  if (CATEGORY_EMOJIS[lower]) return CATEGORY_EMOJIS[lower];
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
    if (lower.includes(key) || key.includes(lower)) return emoji;
  }
  return '🍽️';
}

// ─── Types ──────────────────────────────────────────────

interface ClientMenuPageProps {
  tenant: Tenant;
  venues: Venue[];
  initialTable?: string;
  categories: Category[];
  ads: Ad[];
  zones: Zone[];
  tables: Table[];
  announcement?: Announcement | null;
  featuredItems?: MenuItem[];
}

// ─── Component ──────────────────────────────────────────

export default function ClientMenuPage({
  tenant,
  venues,
  initialTable,
  categories,
  ads,
  zones,
  tables,
  announcement,
  featuredItems = [],
}: ClientMenuPageProps) {
  const t = useTranslations('tenant');
  const locale = useLocale();
  const lang = locale.startsWith('en') ? 'en' : 'fr';
  const router = useRouter();
  const { toast } = useToast();
  const { items: cartItems, grandTotal } = useCartData();
  const { formatDisplayPrice, resolveAndFormatPrice } = useDisplayCurrency();
  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const primary = tenant.primary_color || '#2D5A3D';

  // ─── State ─────────────────────────────────────────────
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [tableNumber, setTableNumber] = useState<string | null>(() => {
    if (initialTable) return initialTable;
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`attabl_${tenant.slug}_table`);
    }
    return null;
  });
  const [isSearchSticky, setIsSearchSticky] = useState(false);
  const searchBarRef = useRef<HTMLDivElement>(null);

  // ─── Table auto-detection from URL ─────────────────────
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

  // ─── Realtime subscriptions ─────────────────────────────
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
      router.push(`/sites/${tenant.slug}/menu?menu=${result.menuSlug}`);
    }
  };

  // ─── Render ────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-app-bg"
      style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ═══ FULLSCREEN SPLASH ═══ */}
      <FullscreenSplash tenantName={tenant.name} logoUrl={tenant.logo_url} primaryColor={primary} />

      {/* ═══ STICKY HEADER (appears on scroll) ═══ */}
      <div
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          isSearchSticky
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 -translate-y-2 pointer-events-none',
        )}
      >
        <div className="bg-app-bg/95 backdrop-blur-md border-b border-app-border">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              {tenant.logo_url ? (
                <Image
                  src={tenant.logo_url}
                  alt={tenant.name}
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: primary }}
                >
                  <span className="text-white text-xs font-bold">{tenant.name.charAt(0)}</span>
                </div>
              )}
              <span className="text-sm font-semibold text-app-text">{tenant.name}</span>
            </div>
            {totalCartItems > 0 && (
              <Link href={`/sites/${tenant.slug}/cart`} className="relative p-2">
                <ShoppingCart className="w-5 h-5 text-app-text" />
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: primary }}
                >
                  {totalCartItems}
                </span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ═══ HEADER - Profile style (exactly like screenshot) ═══ */}
      <div className="px-5 pt-5 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            {/* Round avatar - matching screenshot circle */}
            {tenant.logo_url ? (
              <Image
                src={tenant.logo_url}
                alt={tenant.name}
                width={52}
                height={52}
                className="size-13 rounded-full object-cover border-[2.5px] border-app-card shadow-md"
                priority
              />
            ) : (
              <div
                className="size-13 rounded-full flex items-center justify-center border-[2.5px] border-app-card shadow-md"
                style={{ backgroundColor: primary }}
              >
                <span className="text-white text-xl font-bold">{tenant.name.charAt(0)}</span>
              </div>
            )}
            <div>
              <h1 className="text-[17px] font-bold text-app-text leading-tight">{tenant.name}</h1>
              <p className="text-[13px] text-app-text-muted mt-0.5">
                {tableNumber
                  ? t('seatedAtTable', { table: tableNumber })
                  : tenant.description
                    ? tenant.description.length > 30
                      ? tenant.description.slice(0, 30) + '...'
                      : tenant.description
                    : t('welcomeSubtitle')}
              </p>
            </div>
          </div>
          {/* Bell icon - top right like screenshot */}
          <button className="w-10 h-10 rounded-full bg-app-card border border-app-border shadow-sm flex items-center justify-center hover:bg-app-elevated transition-colors">
            <Bell className="size-4.5 text-app-text-muted" />
          </button>
        </div>
      </div>

      {/* ═══ SEARCH BAR - Rounded pill style like screenshot ═══ */}
      <div ref={searchBarRef} className="px-5 pt-4 pb-2">
        <button
          onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
          className="relative w-full"
        >
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="size-4.5 text-app-text-muted" strokeWidth={1.8} />
          </div>
          <div className="w-full bg-app-card border border-app-border rounded-xl py-3.5 pl-11 pr-5 text-[14px] text-app-text-muted shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {t('searchMenu')}
          </div>
        </button>
      </div>

      {/* ═══ ADS BANNER ═══ */}
      {ads && ads.length > 0 && (
        <div className="px-5 py-2">
          <AdsSlider ads={ads} />
        </div>
      )}

      {/* ═══ ANNOUNCEMENT BANNER ═══ */}
      {announcement && (
        <div className="px-5 mb-1 mt-1">
          <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '21/9' }}>
            {announcement.image_url ? (
              <Image
                src={announcement.image_url}
                alt={getTranslatedContent(lang, announcement.title, announcement.title_en)}
                fill
                sizes="(max-width: 768px) 100vw, 600px"
                className="object-cover"
              />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background: `linear-gradient(135deg, ${primary} 0%, ${primary}99 100%)`,
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-sm font-bold text-white mb-0.5 leading-snug">
                {getTranslatedContent(lang, announcement.title, announcement.title_en)}
              </h3>
              {announcement.description && (
                <p className="text-xs text-white/80 leading-relaxed">
                  {getTranslatedContent(
                    lang,
                    announcement.description,
                    announcement.description_en,
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CATEGORY CIRCLES - 2×4 grid, exactly like screenshot ═══ */}
      {categories.length > 0 && (
        <div className="px-5 pt-4 pb-2">
          <div className="grid grid-cols-4 gap-y-4 gap-x-3">
            {categories.slice(0, 8).map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  router.push(`/sites/${tenant.slug}/menu?section=${encodeURIComponent(cat.name)}`);
                }}
                className="flex flex-col items-center gap-2 group"
              >
                {/* Circular icon - cream/beige background like screenshot */}
                <div className="w-16 h-16 rounded-full bg-app-elevated flex items-center justify-center group-hover:bg-app-bg transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                  <span className="text-[26px] leading-none">{getCategoryEmoji(cat.name)}</span>
                </div>
                <span className="text-[11px] font-medium text-app-text leading-tight text-center">
                  {getTranslatedContent(lang, cat.name, cat.name_en)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ EXPLORE VENUES - Horizontal scroll with circular avatars (like "Explore cooking mentors") ═══ */}
      {venues && venues.length > 0 && (
        <div className="pt-5 pb-2">
          <div className="flex items-center justify-between px-5 mb-3">
            <h2 className="text-[15px] font-bold text-app-text">{t('ourUniverses')}</h2>
            {venues.length > 1 && (
              <button
                onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
                className="text-[12px] font-semibold text-app-text-muted hover:text-app-text transition-colors"
              >
                {t('viewAll')}
              </button>
            )}
          </div>
          <div className="flex gap-4 overflow-x-auto px-5 pb-1 scrollbar-hide">
            {/* "All menus" entry */}
            <button
              onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
              className="flex flex-col items-center gap-1.5 flex-shrink-0"
            >
              <div
                className="size-15 rounded-full flex items-center justify-center border-2 border-app-card shadow-sm"
                style={{ backgroundColor: `${primary}15` }}
              >
                <Utensils className="w-6 h-6" style={{ color: primary }} />
              </div>
              <span className="text-[11px] font-medium text-app-text-muted text-center w-15">
                {t('allMenus')}
              </span>
            </button>
            {venues.map((venue) => (
              <button
                key={venue.id}
                onClick={() =>
                  router.push(`/sites/${tenant.slug}/menu?v=${venue.slug || venue.id}`)
                }
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
              >
                <div className="size-15 rounded-full overflow-hidden border-2 border-app-card shadow-sm bg-app-elevated">
                  {venue.image_url ? (
                    <Image
                      src={venue.image_url}
                      alt={venue.name}
                      width={60}
                      height={60}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-app-elevated">
                      <span className="text-lg font-bold text-app-text-muted">
                        {venue.name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-medium text-app-text-muted text-center w-15">
                  {venue.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ CART PREVIEW - Horizontal scroll (like screenshot mentors section) ═══ */}
      {cartItems.length > 0 && (
        <div className="pt-4 pb-1">
          <div className="flex items-center justify-between px-5 mb-3">
            <h2 className="text-[15px] font-bold text-app-text">{t('yourCart')}</h2>
            <Link
              href={`/sites/${tenant.slug}/cart`}
              className="text-[12px] font-semibold transition-colors"
              style={{ color: primary }}
            >
              {t('viewAll')}
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide">
            {cartItems.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                href={`/sites/${tenant.slug}/cart`}
                className="flex-shrink-0 w-30 bg-app-card rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-md transition-shadow"
              >
                <div className="w-full h-20 bg-app-bg overflow-hidden flex items-center justify-center">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={120}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Utensils className="w-5 h-5 text-app-text-muted" />
                  )}
                </div>
                <div className="p-2.5">
                  <h3 className="text-[11px] font-semibold text-app-text leading-tight mb-1">
                    {item.name}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold" style={{ color: primary }}>
                      {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                    </span>
                    <span className="text-[9px] font-bold text-app-text-muted bg-app-elevated px-1.5 py-0.5 rounded-full">
                      x{item.quantity}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FEATURED ITEMS - "Recipes populer" style 2-col grid ═══ */}
      {featuredItems.length > 0 && (
        <div className="pt-5 pb-2 px-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-bold text-app-text">{t('dontMiss')}</h2>
            <button
              onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
              className="text-[12px] font-semibold text-app-text-muted hover:text-app-text transition-colors"
            >
              {t('viewAll')}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            {featuredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="bg-app-card rounded-2xl overflow-hidden text-left shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-lg transition-shadow group"
              >
                {/* Image with heart icon overlay - like screenshot */}
                <div className="w-full aspect-[4/3] relative overflow-hidden bg-app-elevated">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={getTranslatedContent(lang, item.name, item.name_en)}
                      fill
                      sizes="(max-width: 768px) 50vw, 300px"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Utensils className="w-8 h-8 text-app-text-muted" />
                    </div>
                  )}
                  {/* Heart icon - top right like screenshot */}
                  <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-app-card/90 backdrop-blur-sm flex items-center justify-center shadow-sm">
                    <Heart className="w-4 h-4 text-app-text-muted" />
                  </div>
                </div>
                <div className="p-3 pt-2.5">
                  <h3 className="text-[13px] font-semibold text-app-text leading-snug mb-1.5">
                    {getTranslatedContent(lang, item.name, item.name_en)}
                  </h3>
                  {/* Tags row - like screenshot category pills */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.category?.name && (
                      <span className="text-[10px] font-medium text-app-text-muted bg-app-elevated rounded-full px-2.5 py-0.5">
                        {getTranslatedContent(lang, item.category.name, item.category.name_en)}
                      </span>
                    )}
                    {item.is_vegetarian && (
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2.5 py-0.5">
                        Veggie
                      </span>
                    )}
                    {item.is_spicy && (
                      <span className="text-[10px] font-medium text-orange-600 bg-orange-50 rounded-full px-2.5 py-0.5">
                        Spicy
                      </span>
                    )}
                  </div>
                  <span className="text-[14px] font-bold" style={{ color: primary }}>
                    {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ "SEE FULL MENU" CTA ═══ */}
      <div className="px-5 pt-4 pb-6">
        <button
          onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
          className="w-full py-4 rounded-2xl text-white text-[15px] font-bold flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition-opacity active:scale-[0.98]"
          style={{ backgroundColor: primary }}
        >
          <Utensils className="size-4.5" />
          {t('seeFullMenu')}
        </button>
      </div>

      {/* ═══ FLOATING CART BAR ═══ */}
      {totalCartItems > 0 && (
        <div className="fixed bottom-18 left-4 right-4 z-40 max-w-lg mx-auto">
          <Link
            href={`/sites/${tenant.slug}/cart`}
            className="flex items-center justify-between w-full py-3.5 px-5 rounded-2xl text-white shadow-xl"
            style={{ backgroundColor: primary }}
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
        onManualEntry={() => setIsTablePickerOpen(true)}
        tables={tables}
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

      <BottomNav tenantSlug={tenant.slug} />
    </div>
  );
}
