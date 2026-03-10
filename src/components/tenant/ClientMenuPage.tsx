'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Search, ShoppingCart, Utensils, ChevronRight } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCartData } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
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
  loading: () => <div className="h-64 animate-pulse bg-gray-100 rounded-lg" />,
});

// ─── Helpers ────────────────────────────────────────────

// formatPrice is now handled by useDisplayCurrency().formatDisplayPrice

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

  // ─── Auto-open QR on first visit ──────────────────────
  const scannerCheckRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || scannerCheckRef.current) return;
    scannerCheckRef.current = true;

    const savedTable = localStorage.getItem(`attabl_${tenant.slug}_table`);
    if (!initialTable && !savedTable) {
      // Don't auto-open scanner in development — only in production
      if (process.env.NODE_ENV === 'production') {
        const timer = setTimeout(() => setIsQRScannerOpen(true), 600);
        return () => clearTimeout(timer);
      }
    }
  }, [initialTable, tenant.slug]);

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

    // If QR contains a menu slug, navigate to menu page
    if (result.menuSlug) {
      router.push(`/sites/${tenant.slug}/menu?menu=${result.menuSlug}`);
    }
  };

  // ─── Render ────────────────────────────────────────────
  return (
    <div
      className="flex-1 w-full min-h-screen"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {/* ═══ FULLSCREEN SPLASH — shown on QR code scan ═══ */}
      <FullscreenSplash
        tenantName={tenant.name}
        logoUrl={tenant.logo_url}
        primaryColor={tenant.primary_color || '#000000'}
      />

      {/* ═══ STICKY HEADER — appears when scrolled past search bar ═══ */}
      {isSearchSticky && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
          <div style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ width: '100%', padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Logo or tenant name */}
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>
                    {tenant.name}
                  </h2>
                </div>
                <div style={{ width: '40px' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ GRADIENT HERO SECTION ═══ */}
      <div
        className="pt-6"
        style={{
          background: `linear-gradient(180deg, ${tenant.primary_color || '#003058'} 0%, ${tenant.primary_color || '#003058'}cc 22%, ${tenant.primary_color || '#003058'}88 40%, ${tenant.primary_color || '#003058'}44 55%, ${tenant.primary_color || '#003058'}22 68%, ${tenant.primary_color || '#003058'}11 78%, ${tenant.primary_color || '#003058'}08 86%, transparent 93%, #ffffff 100%)`,
        }}
      >
        <div>
          {/* Original Header — visible when not scrolled */}
          <div
            className={cn(
              'transition-opacity duration-300',
              isSearchSticky ? 'opacity-0' : 'opacity-100',
            )}
          >
            <div
              className="w-full px-4 py-3 flex items-center justify-between"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
              }}
            >
              <div style={{ width: '40px' }} />
              {/* Logo or tenant name */}
              {tenant.logo_url ? (
                <Image
                  src={tenant.logo_url}
                  alt={tenant.name}
                  width={260}
                  height={24}
                  className="h-6 w-auto max-w-[180px] sm:max-w-[260px] object-contain"
                  priority
                />
              ) : (
                <h1
                  className="text-xl font-bold text-white tracking-tight"
                  style={{
                    color: '#ffffff',
                    fontSize: '20px',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {tenant.name}
                </h1>
              )}
              <div style={{ width: '40px' }} />
            </div>
          </div>

          {/* ADS BANNER */}
          {ads && ads.length > 0 && !isSearchSticky && (
            <div className="px-4 mb-6">
              <AdsSlider ads={ads} />
            </div>
          )}

          {/* ANNOUNCEMENT BANNER */}
          {announcement && !isSearchSticky && (
            <div style={{ padding: '0 16px', marginBottom: '24px' }}>
              <div
                style={{
                  position: 'relative',
                  borderRadius: '28px',
                  overflow: 'hidden',
                  aspectRatio: '21/9',
                }}
              >
                {announcement.image_url ? (
                  <Image
                    src={announcement.image_url}
                    alt={getTranslatedContent(lang, announcement.title, announcement.title_en)}
                    fill
                    sizes="(max-width: 768px) 100vw, 600px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: `linear-gradient(135deg, ${tenant.primary_color || '#003058'} 0%, ${tenant.primary_color || '#003058'}99 100%)`,
                    }}
                  />
                )}
                {/* Gradient overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
                  }}
                />
                {/* Text at bottom */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 20px',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#ffffff',
                      marginBottom: '4px',
                      lineHeight: 1.3,
                    }}
                  >
                    {getTranslatedContent(lang, announcement.title, announcement.title_en)}
                  </h3>
                  {announcement.description && (
                    <p
                      style={{
                        fontSize: '12px',
                        color: 'rgba(255,255,255,0.85)',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
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

          <div className="w-full px-4">
            {/* SEARCH BAR — navigates to menu page */}
            <div ref={searchBarRef} style={{ marginTop: '16px', marginBottom: '24px' }}>
              <button
                onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
                className="relative w-full"
                style={{ position: 'relative', width: '100%', textAlign: 'left' }}
              >
                <div
                  className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400"
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
                  <Search
                    className="w-[18px] h-[18px]"
                    style={{ width: '18px', height: '18px' }}
                    strokeWidth={1.5}
                  />
                </div>
                <div
                  className="w-full bg-white border border-gray-300 rounded-3xl py-3 pl-11 pr-5 text-sm font-medium text-gray-400"
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '24px',
                    padding: '12px 20px 12px 44px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#9ca3af',
                  }}
                >
                  {t('searchMenu')}
                </div>
              </button>
            </div>

            {/* Welcome text + table number */}
            <div style={{ marginBottom: '20px' }}>
              <h1
                className="text-white text-xl sm:text-2xl font-bold mb-1 leading-tight"
                style={{
                  color: '#ffffff',
                  fontSize: '22px',
                  fontWeight: 700,
                  marginBottom: '4px',
                  lineHeight: 1.2,
                }}
              >
                {t('heroSubtitle')}
              </h1>
              {tableNumber && (
                <p
                  className="text-white/80 text-sm sm:text-base font-normal"
                  style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}
                >
                  {t('seatedAtTable', { table: tableNumber })}
                </p>
              )}
            </div>

            {/* CART PREVIEW — horizontal scroll cards */}
            {cartItems.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-white tracking-tight">
                    {t('yourCart')}
                  </h2>
                  <Link
                    href={`/sites/${tenant.slug}/cart`}
                    className="text-[10px] font-bold uppercase tracking-widest text-white/70 hover:text-white transition-colors"
                  >
                    {t('viewAll')} →
                  </Link>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {cartItems.slice(0, 5).map((item) => (
                    <Link
                      key={item.id}
                      href={`/sites/${tenant.slug}/cart`}
                      className="flex-shrink-0 bg-white rounded-xl border border-gray-300 transition-all p-3 w-32 group"
                    >
                      <div className="w-full h-20 bg-gray-100 rounded-lg overflow-hidden mb-2 flex items-center justify-center">
                        <Utensils className="w-6 h-6 text-gray-300" />
                      </div>
                      <h3 className="text-[10px] font-bold text-gray-900 line-clamp-2 mb-1 leading-tight">
                        {item.name}
                      </h3>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-[#C5A065]">
                          {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                        </span>
                        <span className="text-[9px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          x{item.quantity}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ CATEGORY GRID (emoji circles — navigate to menu page) ═══ */}
      {categories.length > 0 && (
        <div style={{ backgroundColor: '#ffffff', padding: '8px 16px 32px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
                letterSpacing: '-0.01em',
              }}
            >
              {t('exploreFlavors')}
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3" style={{ gap: '12px' }}>
            {categories.slice(0, 8).map((cat, idx) => (
              <button
                key={cat.id}
                onClick={() => {
                  router.push(`/sites/${tenant.slug}/menu?section=${encodeURIComponent(cat.name)}`);
                }}
                className="text-center group animate-fade-in-up"
                style={{
                  textAlign: 'center',
                  animationDelay: `${idx * 50}ms`,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <div
                  style={{
                    width: 'clamp(56px, 16vw, 72px)',
                    height: 'clamp(56px, 16vw, 72px)',
                    margin: '0 auto',
                    borderRadius: '50%',
                    backgroundColor: '#f9fafb',
                    padding: '4px',
                    marginBottom: '8px',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #f3f4f6',
                      background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
                    }}
                  >
                    <span style={{ fontSize: '28px', lineHeight: 1 }}>
                      {getCategoryEmoji(cat.name)}
                    </span>
                  </div>
                </div>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#4b5563',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {getTranslatedContent(lang, cat.name, cat.name_en)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ VENUE CARDS (navigate to menu page) ═══ */}
      {venues && venues.length > 1 && (
        <div style={{ padding: '0 16px', marginBottom: '40px' }}>
          <p style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', marginBottom: '16px' }}>
            {t('ourUniverses')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* All button — navigate to full menu */}
            <button
              onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
              style={{
                width: '100%',
                backgroundColor: '#fff',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                textAlign: 'left',
                padding: '16px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Utensils style={{ width: '24px', height: '24px', color: '#9ca3af' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                  {t('allMenus')}
                </span>
              </div>
            </button>
            {venues.map((venue) => (
              <button
                key={venue.id}
                onClick={() =>
                  router.push(`/sites/${tenant.slug}/menu?v=${venue.slug || venue.id}`)
                }
                style={{
                  width: '100%',
                  backgroundColor: '#fff',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'block',
                }}
              >
                <div style={{ height: '176px', position: 'relative', overflow: 'hidden' }}>
                  {venue.image_url ? (
                    <Image
                      src={venue.image_url}
                      alt={venue.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 600px"
                      className="object-cover"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#f3f4f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Utensils style={{ width: '40px', height: '40px', color: '#d1d5db' }} />
                    </div>
                  )}
                </div>
                <div style={{ padding: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>
                    {venue.name}
                  </h3>
                  {venue.description && (
                    <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      {venue.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ FEATURED ITEMS (horizontal scroll) ═══ */}
      {featuredItems.length > 0 && (
        <div style={{ padding: '0 16px', marginBottom: '32px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h2
              style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
                letterSpacing: '-0.01em',
              }}
            >
              {t('dontMiss')}
            </h2>
            <button
              onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
              style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#9ca3af',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('viewAll')} →
            </button>
          </div>
          <div
            style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}
            className="scrollbar-hide"
          >
            {featuredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                style={{
                  flexShrink: 0,
                  width: '160px',
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 0,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '120px',
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: '#f3f4f6',
                  }}
                >
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={getTranslatedContent(lang, item.name, item.name_en)}
                      fill
                      sizes="160px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Utensils style={{ width: '28px', height: '28px', color: '#d1d5db' }} />
                    </div>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <h3
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#111827',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      marginBottom: '4px',
                    }}
                  >
                    {getTranslatedContent(lang, item.name, item.name_en)}
                  </h3>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      color: tenant.primary_color || '#003058',
                    }}
                  >
                    {resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══ "SEE FULL MENU" CTA ═══ */}
      <div style={{ padding: '0 16px', marginBottom: '32px' }}>
        <button
          onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            backgroundColor: tenant.primary_color || '#003058',
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <Utensils style={{ width: '18px', height: '18px' }} />
          {t('seeFullMenu')}
        </button>
      </div>

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
        onManualEntry={() => setIsTablePickerOpen(true)}
        tables={tables}
      />

      <InstallPrompt
        appName={tenant.name}
        logoUrl={tenant.logo_url}
        hasFloatingCart={totalCartItems > 0}
      />

      {/* ═══ ITEM DETAIL SHEET (for featured items) ═══ */}
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
