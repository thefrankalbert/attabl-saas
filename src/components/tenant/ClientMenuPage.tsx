'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Home,
  ShoppingBag,
  Clock,
  SlidersHorizontal,
  Search,
  MapPin,
  ChevronDown,
  ChevronRight,
  Utensils,
} from 'lucide-react';
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
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import FullscreenSplash from '@/components/tenant/FullscreenSplash';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import TablePicker from '@/components/tenant/TablePicker';
import type { QRScanResult } from '@/components/tenant/QRScanner';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl" style={{ background: '#eee' }} />,
});

/* ── Twemoji CDN (Twitter high-quality emoji icons) ── */
const twemoji = (code: string) =>
  `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`;

const CATEGORY_TWEMOJI: Record<string, string> = {
  entree: '1f957',
  starters: '1f957',
  'pour commencer': '1f957',
  burger: '1f354',
  burgers: '1f354',
  hamburger: '1f354',
  pizza: '1f355',
  pizzas: '1f355',
  pates: '1f35d',
  pasta: '1f35d',
  lasagna: '1f35d',
  grillade: '1f356',
  grills: '1f356',
  plats: '1f37d',
  'plat principal': '1f37d',
  'main course': '1f37d',
  vegetarien: '1f96c',
  vegetarian: '1f96c',
  dessert: '1f370',
  desserts: '1f370',
  douceurs: '1f370',
  boisson: '1f379',
  boissons: '1f379',
  drinks: '1f379',
  cocktail: '1f378',
  cocktails: '1f378',
  aperitif: '1fad2',
  cafe: '2615',
  coffee: '2615',
  africain: '1f372',
  african: '1f372',
  'plats africains': '1f372',
  poisson: '1f41f',
  fish: '1f41f',
  seafood: '1f990',
  salade: '1f957',
  salad: '1f957',
  soupe: '1f35c',
  soup: '1f35c',
  noodles: '1f35c',
  vin: '1f377',
  wine: '1f377',
  biere: '1f37a',
  beer: '1f37a',
  snack: '1f96a',
  snacks: '1f96a',
  sandwich: '1f96a',
  sushi: '1f363',
  tart: '1f967',
  arancini: '1f9c6',
};

function getCatImg(name: string): string {
  const lower = name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (CATEGORY_TWEMOJI[lower]) return twemoji(CATEGORY_TWEMOJI[lower]);
  for (const [key, code] of Object.entries(CATEGORY_TWEMOJI)) {
    if (lower.includes(key) || key.includes(lower)) return twemoji(code);
  }
  return twemoji('1f37d');
}

const getTranslatedContent = (lang: string, fr: string, en?: string | null) =>
  lang === 'en' && en ? en : fr;

/* ── COMPONENTS ── */

interface RestaurantCardData {
  name: string;
  price: string;
  time: string;
  badge?: string;
  rating?: number;
  img: string;
}

function RestaurantCard({ r }: { r: RestaurantCardData }) {
  return (
    <div
      className="min-w-[172px] max-w-[172px] shrink-0 rounded-2xl bg-white overflow-hidden"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}
    >
      <div className="relative h-[115px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.img} alt={r.name} className="w-full h-full object-cover" />
        {r.badge && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1">
            <span className="text-[11px]">{'\uD83D\uDEF5'}</span>
            <span className="text-[11px] font-semibold text-green-700">{r.badge}</span>
          </div>
        )}
        {r.rating && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm rounded-full px-2 py-1">
            <span className="text-xs text-amber-500">{'\u2605'}</span>
            <span className="text-[11px] font-bold">{r.rating}</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[13px] font-semibold text-gray-900 truncate">{r.name}</p>
        <p className="text-[13px] font-bold text-gray-900 mt-1.5">{r.price}</p>
        <div className="flex items-center gap-1 mt-1 text-gray-400">
          <Clock size={13} strokeWidth={1.5} />
          <span className="text-xs">{r.time}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Types ── */

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

/* ── MAIN ── */

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

  const primary = tenant.primary_color || '#4caf50';

  const [activeTab, setActiveTab] = useState('Menu');
  const [activeCat, setActiveCat] = useState<string | null>(null);
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

  // Build venue cards data
  const venueCards: RestaurantCardData[] = venues.map((v) => ({
    name: getTranslatedContent(lang, v.name, v.name_en),
    price: '',
    time: '',
    img: v.image_url || '',
  }));

  // Build featured items cards data
  const featuredCards: RestaurantCardData[] = featuredItems.map((item) => ({
    name: getTranslatedContent(lang, item.name, item.name_en),
    price: resolveAndFormatPrice(item.price, item.prices, tenant.currency),
    time: item.category?.name
      ? getTranslatedContent(lang, item.category.name, item.category.name_en)
      : '',
    badge: item.is_vegetarian ? 'Veggie' : item.is_featured ? 'Top' : undefined,
    img: item.image_url || '',
  }));

  return (
    <div
      className="w-full max-w-[430px] mx-auto min-h-screen relative flex flex-col overflow-hidden"
      style={{
        background: '#f4f4f0',
        fontFamily: "-apple-system, 'SF Pro Display', BlinkMacSystemFont, sans-serif",
      }}
    >
      <FullscreenSplash tenantName={tenant.name} logoUrl={tenant.logo_url} primaryColor={primary} />

      {/* ─ GREEN HEADER ─ */}
      <div
        className="px-5 pt-14 pb-5"
        style={{
          background: 'linear-gradient(180deg, #b5e2a0 0%, #c9edba 50%, #e4f5db 80%, #f4f4f0 100%)',
        }}
      >
        <button
          onClick={() => setIsTablePickerOpen(true)}
          className="flex items-center justify-center gap-1.5 mb-4 w-full"
        >
          <MapPin size={14} className="text-green-700" fill="#3a8a3e" strokeWidth={0} />
          <span className="text-sm font-medium text-gray-800">
            {tableNumber ? `Table ${tableNumber} - ${tenant.name}` : tenant.name}
          </span>
          <ChevronDown size={14} className="text-gray-800" strokeWidth={2.5} />
        </button>
        <h1 className="text-3xl font-extrabold text-gray-900 leading-tight tracking-tight">
          {t('hello') || 'Bienvenue'} 👋
        </h1>
        <p className="text-base text-green-700 mt-1 mb-4 font-medium leading-snug">
          {tenant.description || t('welcomeSubtitle')}
        </p>
        <div className="flex gap-2.5 items-center">
          <button
            onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
            className="flex-1 flex items-center gap-2.5 bg-white rounded-2xl px-4 py-3 shadow-sm"
          >
            <Search size={18} className="text-gray-300" strokeWidth={2.2} />
            <span className="text-sm text-gray-300">{t('searchMenu')}</span>
          </button>
          <button
            onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
            className="flex items-center gap-1.5 bg-white rounded-2xl px-4 py-3 shadow-sm"
          >
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-semibold text-gray-900">
              {lang === 'en' ? 'Now' : 'Menu'}
            </span>
            <ChevronDown size={12} className="text-gray-900" strokeWidth={3} />
          </button>
        </div>
      </div>

      {/* ─ SCROLLABLE CONTENT ─ */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Categories – Twemoji icons */}
        {categories.length > 0 && (
          <div className="flex gap-2 px-5 py-3.5 overflow-x-auto scrollbar-hide">
            {categories.map((c) => {
              const isActive = activeCat === c.id;
              const catName = getTranslatedContent(lang, c.name, c.name_en);
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveCat(isActive ? null : c.id);
                    router.push(`/sites/${tenant.slug}/menu?section=${encodeURIComponent(c.name)}`);
                  }}
                  className="flex flex-col items-center gap-1.5 min-w-[62px] cursor-pointer"
                >
                  <div
                    className="w-[54px] h-[54px] rounded-full flex items-center justify-center"
                    style={{
                      background: isActive ? '#e8f5e9' : '#fff',
                      boxShadow: isActive
                        ? '0 0 0 2px #4caf50, 0 2px 8px rgba(0,0,0,.06)'
                        : '0 2px 8px rgba(0,0,0,.05)',
                      transition: 'all .2s ease',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getCatImg(c.name)}
                      alt={catName}
                      className="w-[32px] h-[32px]"
                      style={{ imageRendering: 'auto' }}
                    />
                  </div>
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: isActive ? '#2e7d32' : '#777' }}
                  >
                    {catName}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Announcement */}
        {announcement && (
          <div className="px-5 pb-3">
            <div className="relative rounded-2xl overflow-hidden" style={{ aspectRatio: '2.5/1' }}>
              {announcement.image_url ? (
                <Image
                  src={announcement.image_url}
                  alt={getTranslatedContent(lang, announcement.title, announcement.title_en)}
                  fill
                  sizes="(max-width: 768px) 100vw, 400px"
                  className="object-cover"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: `linear-gradient(135deg, ${primary}, ${primary}bb)` }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
              <div className="absolute bottom-0 left-0 p-4">
                <h3 className="text-sm font-bold text-white leading-snug">
                  {getTranslatedContent(lang, announcement.title, announcement.title_en)}
                </h3>
              </div>
            </div>
          </div>
        )}

        {/* Nos Univers */}
        {venues.length > 0 && (
          <div className="px-5 mt-1">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('ourUniverses')}</h2>
            <div className="flex gap-3.5 overflow-x-auto pb-1 scrollbar-hide">
              {venues.map((venue, i) => (
                <div
                  key={venue.id}
                  onClick={() =>
                    router.push(`/sites/${tenant.slug}/menu?v=${venue.slug || venue.id}`)
                  }
                  className="cursor-pointer"
                >
                  <RestaurantCard r={venueCards[i]} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Featured Items */}
        {featuredItems.length > 0 && (
          <div className="px-5 mt-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('dontMiss')}</h2>
            <div className="flex gap-3.5 overflow-x-auto pb-1 scrollbar-hide">
              {featuredItems.map((item, i) => (
                <div key={item.id} onClick={() => setSelectedItem(item)} className="cursor-pointer">
                  <RestaurantCard r={featuredCards[i]} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* See full menu */}
        <div className="px-5 mt-6 mb-4">
          <button
            onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
            className="w-full py-3.5 rounded-2xl text-white text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: primary, boxShadow: `0 4px 16px ${primary}40` }}
          >
            <Utensils size={18} />
            {t('seeFullMenu')}
          </button>
        </div>
      </div>

      {/* ─ FLOATING CART BAR ─ */}
      {totalCartItems > 0 && (
        <div className="absolute left-4 right-4 z-40" style={{ bottom: '80px' }}>
          <Link
            href={`/sites/${tenant.slug}/cart`}
            className="flex items-center justify-between w-full py-3.5 px-5 rounded-2xl text-white shadow-xl"
            style={{ backgroundColor: primary }}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4" />
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

      {/* ─ MODALS ─ */}
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
