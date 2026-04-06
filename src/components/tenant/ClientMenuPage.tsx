'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Search, ShoppingCart, Utensils, ChevronRight, Leaf, Flame } from 'lucide-react';
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
      className="bg-white"
      style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ═══ FULLSCREEN SPLASH ═══ */}
      <FullscreenSplash tenantName={tenant.name} logoUrl={tenant.logo_url} primaryColor={primary} />

      {/* ═══ HERO — Colored background with welcome text ═══ */}
      <div
        className="relative overflow-hidden rounded-b-[2rem]"
        style={{ backgroundColor: primary }}
      >
        <div className="px-5 pt-12 pb-20">
          {/* Top bar: table/location pill */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => setIsTablePickerOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-white/90"
            >
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                📍
              </span>
              {tableNumber ? `Table ${tableNumber}` : tenant.name}
              <ChevronRight className="w-3 h-3 text-white/60" />
            </button>
            <Link href={`/sites/${tenant.slug}/cart`} className="relative p-2">
              <ShoppingCart className="w-5 h-5 text-white" />
              {totalCartItems > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-5 h-5 rounded-full bg-white text-[11px] font-bold flex items-center justify-center"
                  style={{ color: primary }}
                >
                  {totalCartItems > 9 ? '9+' : totalCartItems}
                </span>
              )}
            </Link>
          </div>

          {/* Welcome text — 2 lines with different styles */}
          <h1 className="text-2xl font-bold text-white leading-tight">
            {t('hello') || 'Bienvenue'},
          </h1>
          <p className="text-base font-semibold mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {tenant.description || t('welcomeSubtitle')}
          </p>
        </div>

        {/* Search bar — floating on the boundary */}
        <div ref={searchBarRef} className="absolute bottom-0 left-0 right-0 translate-y-1/2 px-5">
          <div
            onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-2xl shadow-lg cursor-pointer"
          >
            <Search className="w-5 h-5 text-neutral-400" />
            <span className="flex-1 text-sm text-neutral-400">{t('searchMenu')}</span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-600">
              {lang === 'en' ? 'Now' : 'Menu'}
            </span>
          </div>
        </div>
      </div>

      {/* Spacer for floating search bar */}
      <div className="h-8" />

      {/* ═══ ANNOUNCEMENT BANNER ═══ */}
      {announcement && (
        <div className="px-5 pt-2 pb-1">
          <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '16/7' }}>
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
                style={{ background: `linear-gradient(135deg, ${primary} 0%, ${primary}99 100%)` }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="text-sm font-bold text-white leading-snug">
                {getTranslatedContent(lang, announcement.title, announcement.title_en)}
              </h3>
              {announcement.description && (
                <p className="text-xs text-white/80 leading-relaxed mt-0.5">
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

      {/* ═══ CATEGORIES — Horizontal scroll with emoji + name (like the reference) ═══ */}
      {categories.length > 0 && (
        <div className="pt-5 pb-1">
          <div className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  router.push(`/sites/${tenant.slug}/menu?section=${encodeURIComponent(cat.name)}`)
                }
                className="flex flex-col items-center gap-1.5 flex-shrink-0"
              >
                <div className="w-14 h-14 rounded-2xl bg-app-card border border-app-border/30 shadow-sm flex items-center justify-center hover:shadow-md transition-shadow active:scale-95">
                  <span className="text-2xl leading-none">{getCategoryEmoji(cat.name)}</span>
                </div>
                <span className="text-[11px] font-medium text-app-text-secondary text-center w-14 leading-tight">
                  {getTranslatedContent(lang, cat.name, cat.name_en)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ NOS CARTES — Venues as visual cards ═══ */}
      {venues && venues.length > 0 && (
        <div className="pt-4 pb-1">
          <div className="flex items-center justify-between px-5 mb-3">
            <h2 className="text-base font-bold text-app-text">{t('ourUniverses')}</h2>
            {venues.length > 1 && (
              <button
                onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
                className="text-xs font-semibold transition-colors"
                style={{ color: primary }}
              >
                {t('viewAll')}
              </button>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide">
            {venues.map((venue) => (
              <button
                key={venue.id}
                onClick={() =>
                  router.push(`/sites/${tenant.slug}/menu?v=${venue.slug || venue.id}`)
                }
                className="flex-shrink-0 w-40 bg-app-card rounded-2xl overflow-hidden shadow-sm border border-app-border/30 hover:shadow-md transition-shadow text-left"
              >
                <div className="w-full h-28 bg-app-elevated overflow-hidden relative">
                  {venue.image_url ? (
                    <Image
                      src={venue.image_url}
                      alt={venue.name}
                      width={160}
                      height={112}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl font-bold text-app-text-muted">
                        {venue.name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-app-text leading-tight">
                    {getTranslatedContent(lang, venue.name, venue.name_en)}
                  </h3>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FEATURED ITEMS — Horizontal scroll cards with badge + price ═══ */}
      {featuredItems.length > 0 && (
        <div className="pt-4 pb-2">
          <div className="flex items-center justify-between px-5 mb-3">
            <h2 className="text-base font-bold text-app-text">{t('dontMiss')}</h2>
            <button
              onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
              className="text-xs font-semibold transition-colors"
              style={{ color: primary }}
            >
              {t('viewAll')}
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide">
            {featuredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="flex-shrink-0 w-48 bg-white rounded-2xl overflow-hidden shadow-sm border border-neutral-100 hover:shadow-md transition-shadow text-left group"
              >
                <div className="w-full aspect-[4/3] relative overflow-hidden bg-neutral-100">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={getTranslatedContent(lang, item.name, item.name_en)}
                      fill
                      sizes="200px"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Utensils className="w-8 h-8 text-neutral-300" />
                    </div>
                  )}
                  {/* Badge on image */}
                  {item.is_featured && (
                    <span
                      className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-1 rounded-lg text-white"
                      style={{ backgroundColor: primary }}
                    >
                      {item.is_vegetarian ? 'Veggie' : 'Top'}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-neutral-900 leading-snug">
                    {getTranslatedContent(lang, item.name, item.name_en)}
                  </h3>
                  <p className="text-sm font-bold mt-1" style={{ color: primary }}>
                    {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  </p>
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
          className="w-full h-14 rounded-2xl text-white text-base font-bold flex items-center justify-center gap-2 shadow-lg hover:opacity-90 transition-opacity active:scale-[0.98]"
          style={{ backgroundColor: primary }}
        >
          <Utensils className="w-5 h-5" />
          {t('seeFullMenu')}
        </button>
      </div>

      {/* ═══ FLOATING CART BAR ═══ */}
      {totalCartItems > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-40 max-w-lg mx-auto">
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
