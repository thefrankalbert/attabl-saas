'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ShoppingBag,
  X,
  MapPin,
  Phone,
  Building2,
  UtensilsCrossed,
  Clock,
  Star,
  TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';
import { useCartData } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import type {
  Menu,
  Category,
  Ad,
  Tenant,
  Zone,
  Table,
  Announcement,
  MenuItem,
  Coupon,
} from '@/types/admin.types';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import FullscreenSplash from '@/components/tenant/FullscreenSplash';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import SearchOverlay from '@/components/tenant/SearchOverlay';
import EmptyState from '@/components/shared/EmptyState';
import { LockedTablePill } from '@/components/tenant/ui/LockedTablePill';
import { HeroChefPick } from '@/components/tenant/ui/HeroChefPick';

const triggerAddFeedback = () => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(10);
    } catch {
      // Silent: vibration not supported or blocked
    }
  }
};

/* =================================================
   DESIGN SYSTEM - all tokens from DESIGN.md
   ================================================= */
const C = {
  primary: '#1A1A1A',
  primaryDark: '#000000',
  primaryLight: '#F6F6F6',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F6F6',
  divider: '#EEEEEE',
  textPrimary: '#1A1A1A',
  textSecondary: '#737373',
  textMuted: '#B0B0B0',
  textOnPrimary: '#FFFFFF',
  rating: '#FFB800',
  promo: '#FF3008',
  cartBg: '#1A1A1A',
} as const;

/* -- Category icon mapping (public/category-icons/) -- */
const CATEGORY_ICONS: Record<string, string> = {
  burger: 'burger.png',
  burgers: 'burger.png',
  hamburger: 'burger.png',
  hamburgers: 'burger.png',
  entree: 'caribbean.png',
  entrees: 'caribbean.png',
  starters: 'caribbean.png',
  'pour commencer': 'caribbean.png',
  plats: 'caribbean.png',
  'plat principal': 'caribbean.png',
  'plats principaux': 'caribbean.png',
  'main course': 'caribbean.png',
  grillade: 'caribbean.png',
  grills: 'caribbean.png',
  grille: 'caribbean.png',
  bbq: 'caribbean.png',
  asiatique: 'asian.png',
  asian: 'asian.png',
  noodles: 'asian.png',
  soupe: 'asian.png',
  soup: 'asian.png',
  soupes: 'asian.png',
  pates: 'asian.png',
  pasta: 'asian.png',
  pastas: 'asian.png',
  lasagna: 'asian.png',
  indien: 'indian.png',
  indian: 'indian.png',
  curry: 'indian.png',
  africain: 'indian.png',
  african: 'indian.png',
  'plats africains': 'indian.png',
  glace: 'ice-cream.png',
  glaces: 'ice-cream.png',
  'ice cream': 'ice-cream.png',
  americain: 'american.png',
  american: 'american.png',
  'hot dog': 'american.png',
  alcool: 'alcohol.png',
  alcohol: 'alcohol.png',
  vin: 'alcohol.png',
  vins: 'alcohol.png',
  wine: 'alcohol.png',
  biere: 'alcohol.png',
  bieres: 'alcohol.png',
  beer: 'alcohol.png',
  cocktail: 'alcohol.png',
  cocktails: 'alcohol.png',
  'cocktails alcoolises': 'alcohol.png',
  'cocktails sans alcool': 'alcohol.png',
  aperitif: 'alcohol.png',
  aperitifs: 'alcohol.png',
  boisson: 'alcohol.png',
  boissons: 'alcohol.png',
  drinks: 'alcohol.png',
  beverages: 'alcohol.png',
  chinois: 'chinese.png',
  chinese: 'chinese.png',
  'dim sum': 'chinese.png',
  francais: 'french.png',
  french: 'french.png',
  viande: 'french.png',
  steak: 'french.png',
  halal: 'halal.png',
  brochette: 'halal.png',
  kebab: 'halal.png',
  poulet: 'halal.png',
  chicken: 'halal.png',
  dessert: 'dessert.png',
  desserts: 'dessert.png',
  douceurs: 'dessert.png',
  patisserie: 'dessert.png',
  gateau: 'dessert.png',
  tart: 'dessert.png',
  'fast food': 'fast-food.png',
  'fast-food': 'fast-food.png',
  rapide: 'fast-food.png',
  frites: 'fast-food.png',
  specialite: 'specialty.png',
  specialty: 'specialty.png',
  epicerie: 'specialty.png',
  cafe: 'specialty.png',
  coffee: 'specialty.png',
  the: 'specialty.png',
  tea: 'specialty.png',
  'boissons chaudes': 'specialty.png',
  snack: 'convenience.png',
  snacks: 'convenience.png',
  convenience: 'convenience.png',
  sandwich: 'convenience.png',
  sandwiches: 'convenience.png',
  courses: 'grocery.png',
  grocery: 'grocery.png',
  emporter: 'takeout.png',
  'a emporter': 'takeout.png',
  takeout: 'takeout.png',
  takeaway: 'takeout.png',
  fleurs: 'flowers.png',
  flowers: 'flowers.png',
  salade: 'specialty.png',
  salades: 'specialty.png',
  salad: 'specialty.png',
  salads: 'specialty.png',
  seafood: 'french.png',
  'fruits de mer': 'french.png',
  poisson: 'french.png',
  fish: 'french.png',
  vegetarian: 'grocery.png',
  vegetarien: 'grocery.png',
  vegan: 'grocery.png',
};

function getCatImg(name: string): string {
  const lower = name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (CATEGORY_ICONS[lower]) return `/category-icons/${CATEGORY_ICONS[lower]}`;
  for (const [key, file] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key) || key.includes(lower)) return `/category-icons/${file}`;
  }
  // Neutral fallback for unrecognized categories (specialty is a generic food icon)
  return '/category-icons/specialty.png';
}

const tr = (lang: string, fr: string, en?: string | null) => (lang === 'en' && en ? en : fr);

/* =================================================
   SUB-COMPONENTS
   ================================================= */

/* -- Top Header Bar -- */
function HeaderBar({
  locationName,
  logoUrl,
  tenantName,
  onLocationPress,
  onAvatarPress,
}: {
  locationName: string;
  logoUrl: string | null;
  tenantName: string;
  onLocationPress: () => void;
  onAvatarPress: () => void;
}) {
  return (
    <div
      className="h-14 px-4 flex items-center justify-between"
      style={{
        background: C.background,
      }}
    >
      <Button
        variant="ghost"
        onClick={onLocationPress}
        className="flex items-center gap-1.5 px-0 h-auto"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.75a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5z"
            fill={C.primary}
          />
        </svg>
        <span
          className="text-[15px] font-bold"
          style={{
            color: C.textPrimary,
          }}
        >
          {locationName}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke={C.textPrimary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>

      <Button
        variant="ghost"
        onClick={onAvatarPress}
        className="w-10 h-10 rounded-full overflow-hidden shrink-0 p-0"
        style={{
          background: C.surfaceAlt,
        }}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={tenantName}
            width={40}
            height={40}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            className="text-base font-bold flex items-center justify-center w-full h-full"
            style={{
              color: C.textMuted,
            }}
          >
            {tenantName.charAt(0).toUpperCase()}
          </span>
        )}
      </Button>
    </div>
  );
}

/* -- Search Bar -- */
function SearchBar({ placeholder, onClick }: { placeholder: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="flex items-center gap-2 h-12 mt-2 mx-4 px-4 rounded-[10px] w-[calc(100%-32px)] justify-start"
      style={{
        background: C.surfaceAlt,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke={C.textMuted} strokeWidth="2" />
        <path d="M16 16l4 4" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-sm" style={{ color: C.textMuted }}>
        {placeholder}
      </span>
    </Button>
  );
}

/* -- Promotional Banner Carousel (ads + announcements) -- */
function PromoBanner({
  announcements,
  ads,
  lang,
}: {
  announcements: Announcement[];
  ads: Ad[];
  lang: string;
}) {
  const t = useTranslations('tenant');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const promoLabel = t('bannerPromoLabel');
  const slides: { imageUrl: string; label: string; title: string }[] = [];
  ads.forEach((ad) => {
    if (ad.image_url) {
      slides.push({ imageUrl: ad.image_url, label: promoLabel, title: '' });
    }
  });
  announcements.forEach((a) => {
    slides.push({
      imageUrl: a.image_url || '',
      label: promoLabel,
      title: tr(lang, a.title, a.title_en),
    });
  });

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIdx((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({
          left: next * scrollRef.current.offsetWidth,
          behavior: 'smooth',
        });
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div className="mt-5">
      <div
        ref={scrollRef}
        onScroll={() => {
          if (!scrollRef.current) return;
          const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
          setActiveIdx(idx);
        }}
        className="flex overflow-x-auto snap-x snap-mandatory px-4 gap-3 scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="min-w-[calc(100%-32px)] snap-start h-40 rounded-[10px] overflow-hidden relative shrink-0"
          >
            {slide.imageUrl ? (
              <Image
                src={slide.imageUrl}
                alt={slide.title || 'Promotion'}
                fill
                sizes="400px"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', background: C.primary }} />
            )}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)',
              }}
            />
            <div className="absolute bottom-4 left-4 z-[2]">
              {slide.label && (
                <span
                  className="text-[11px] font-normal tracking-[1px]"
                  style={{
                    color: C.textOnPrimary,
                  }}
                >
                  {slide.label}
                </span>
              )}
              {slide.title && (
                <p
                  className="text-xl font-bold mt-1 leading-[1.4]"
                  style={{
                    color: C.textOnPrimary,
                  }}
                >
                  {slide.title}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {slides.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-[3px] transition-all duration-200 ease-in-out"
              style={{
                width: activeIdx === i ? 20 : 6,
                background: activeIdx === i ? C.primary : C.divider,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -- Section Header Row -- */
function SectionHeader({
  title,
  onSeeAll,
  seeAllLabel,
}: {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  return (
    <div className="flex justify-between items-center pt-5 px-4 pb-3">
      <h2
        className="text-xl font-bold m-0"
        style={{
          color: C.textPrimary,
        }}
      >
        {title}
      </h2>
      {onSeeAll && seeAllLabel && (
        <Button
          variant="ghost"
          onClick={onSeeAll}
          className="text-sm font-bold px-0 h-auto"
          style={{
            color: C.primary,
          }}
        >
          {seeAllLabel}
        </Button>
      )}
    </div>
  );
}

/* -- Horizontal scroll container -- */
function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex overflow-x-auto gap-3 px-4 pb-1 scrollbar-hide"
      style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {children}
    </div>
  );
}

/* -- Menu Card (horizontal scroll) -- larger than VenueCard, used when tenant has
   multiple cartes (menus). Click navigates to /sites/[slug]/menu?menu=[slug]. */
function MenuCard({ menu, lang, onClick }: { menu: Menu; lang: string; onClick: () => void }) {
  const name = tr(lang, menu.name, menu.name_en);
  const desc = tr(lang, menu.description || '', menu.description_en);
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="w-60 shrink-0 rounded-[10px] overflow-hidden px-0 py-0 text-left flex flex-col justify-start h-auto"
      style={{
        background: C.surface,
        border: `1px solid ${C.divider}`,
      }}
    >
      <div
        className="w-full h-[140px] relative"
        style={{
          background: C.surfaceAlt,
        }}
      >
        {menu.image_url ? (
          <Image
            src={menu.image_url}
            alt={name}
            fill
            sizes="240px"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-[32px] font-bold"
            style={{
              color: C.textMuted,
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="py-3 px-3.5 pb-3.5">
        <p
          className="text-base font-bold m-0 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            color: C.textPrimary,
          }}
        >
          {name}
        </p>
        {desc && (
          <p
            className="text-[13px] font-normal mt-1 overflow-hidden leading-[1.4]"
            style={{
              color: C.textSecondary,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              minHeight: 'calc(1.4em * 2)',
            }}
          >
            {desc}
          </p>
        )}
      </div>
    </Button>
  );
}

/* -- Category Grid (4 columns) -- */
function CategoryGrid({
  categories,
  lang,
  onSelect,
  onSeeAll,
  seeAllLabel,
}: {
  categories: Category[];
  lang: string;
  onSelect: (cat: Category) => void;
  onSeeAll: () => void;
  seeAllLabel: string;
}) {
  if (categories.length === 0) return null;
  const visible = categories.slice(0, 8);
  const hasMore = categories.length > 8;

  return (
    <div className="px-4">
      <div className="grid grid-cols-4 gap-3">
        {visible.map((cat) => {
          const label = tr(lang, cat.name, cat.name_en);
          return (
            <Button
              key={cat.id}
              variant="ghost"
              onClick={() => onSelect(cat)}
              className="flex flex-col items-center gap-1.5 px-0 py-0 h-auto"
            >
              <div
                className="w-full aspect-square rounded-[10px] flex items-center justify-center"
                style={{
                  background: C.surfaceAlt,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getCatImg(cat.name)}
                  alt={label}
                  width={56}
                  height={56}
                  style={{ width: 56, height: 56, objectFit: 'contain' }}
                  loading="lazy"
                />
              </div>
              <span
                className="text-[11px] font-normal text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-full"
                style={{
                  color: C.textPrimary,
                }}
              >
                {label}
              </span>
            </Button>
          );
        })}
      </div>
      {hasMore && (
        <Button
          variant="ghost"
          onClick={onSeeAll}
          className="block mt-3 mx-auto text-sm font-bold px-0 h-auto"
          style={{
            color: C.primary,
          }}
        >
          {seeAllLabel}
        </Button>
      )}
    </div>
  );
}

/* -- Featured / Horizontal Item Card -- */
type BadgeKind = 'none' | 'new' | 'promo';

function FeaturedItemCard({
  item,
  lang,
  price,
  badge,
  onPress,
  onAdd,
}: {
  item: MenuItem;
  lang: string;
  price: string;
  badge: BadgeKind;
  onPress: () => void;
  onAdd: () => void;
}) {
  const t = useTranslations('tenant');
  const name = tr(lang, item.name, item.name_en);
  const rating = item.rating ?? 4.8;

  return (
    <div
      onClick={onPress}
      className="w-[180px] shrink-0 rounded-[10px] overflow-hidden cursor-pointer flex flex-col"
      style={{
        background: C.surface,
        border: `1px solid ${C.divider}`,
      }}
    >
      <div
        className="w-full h-[140px] relative"
        style={{
          background: C.surfaceAlt,
        }}
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={name}
            fill
            sizes="180px"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.divider}
              strokeWidth="1.5"
            >
              <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
            </svg>
          </div>
        )}
        {badge === 'new' && (
          <span
            className="absolute top-2 left-2 text-[11px] font-bold py-[3px] px-2 rounded-lg tracking-[0.5px]"
            style={{
              background: C.primary,
              color: C.textOnPrimary,
            }}
          >
            {lang === 'en' ? 'New' : 'Nouveau'}
          </span>
        )}
        {badge === 'promo' && (
          <span
            className="absolute top-2 left-2 text-[11px] font-bold py-[3px] px-2 rounded-lg tracking-[0.5px]"
            style={{
              background: C.promo,
              color: C.textOnPrimary,
            }}
          >
            {lang === 'en' ? 'Deal' : 'Offre'}
          </span>
        )}
        <Button
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            triggerAddFeedback();
            onAdd();
          }}
          aria-label={t('addShort')}
          className="absolute -bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center px-0 py-0 h-7 w-7 active:scale-95 transition-transform"
          style={{
            background: C.primary,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 2v10M2 7h10"
              stroke={C.textOnPrimary}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </div>
      <div className="p-3 pt-4 flex flex-col gap-1">
        <p
          className="text-sm font-bold m-0 overflow-hidden leading-[19.6px]"
          style={{
            color: C.textPrimary,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: '39.2px',
          }}
        >
          {name}
        </p>
        <div className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 12 12" fill={C.rating}>
            <path d="M6 0l1.76 3.58L12 4.16 8.88 7.1l.74 4.32L6 9.27 2.38 11.42l.74-4.32L0 4.16l4.24-.58z" />
          </svg>
          <span
            className="text-[13px] font-normal"
            style={{
              color: C.textPrimary,
            }}
          >
            {rating.toFixed(1)}
          </span>
        </div>
        <p
          className="text-[15px] font-bold m-0"
          style={{
            color: C.textPrimary,
          }}
        >
          {price}
        </p>
      </div>
    </div>
  );
}

/* -- Floating Cart Bar -- */
function FloatingCartBar({
  totalItems,
  totalPrice,
  href,
  viewCartLabel,
}: {
  totalItems: number;
  totalPrice: string;
  href: string;
  viewCartLabel: string;
}) {
  if (totalItems <= 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-40 flex justify-center px-4"
      style={{ bottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <Link
        href={href}
        className="inline-flex items-center gap-2.5 px-4 no-underline rounded-full h-12 max-w-[calc(100%-32px)]"
        style={{
          backgroundColor: C.cartBg,
          color: C.textOnPrimary,
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        }}
      >
        <ShoppingBag size={20} strokeWidth={2} color={C.textOnPrimary} />
        <span
          className="text-sm font-bold whitespace-nowrap"
          style={{
            color: C.textOnPrimary,
          }}
        >
          {viewCartLabel}
        </span>
        <span
          className="text-sm font-bold whitespace-nowrap"
          style={{
            color: C.textOnPrimary,
          }}
        >
          {totalItems}
        </span>
        <span
          aria-hidden="true"
          className="inline-block rounded-full w-[5px] h-[5px]"
          style={{ backgroundColor: C.textOnPrimary }}
        />
        <span
          className="text-sm font-bold whitespace-nowrap"
          style={{
            color: C.textOnPrimary,
          }}
        >
          {totalPrice}
        </span>
      </Link>
    </div>
  );
}

/* =================================================
   TYPES
   ================================================= */

interface ClientMenuPageProps {
  tenant: Tenant;
  openingState?: { isOpen: boolean; nextOpenAt: string | null };
  menus?: Menu[];
  initialTable?: string;
  categories: Category[];
  ads: Ad[];
  zones: Zone[];
  tables: Table[];
  announcement?: Announcement | null;
  announcements?: Announcement[];
  featuredItems?: MenuItem[];
  recentItems?: MenuItem[];
  discountedItems?: MenuItem[];
  coupons?: Coupon[];
  ordersThisWeek?: number | null;
  ratingAgg?: { avg: number; count: number } | null;
  recommendedItems?: MenuItem[];
}

/* =================================================
   MAIN COMPONENT
   ================================================= */

/* -- Tenant Info Sheet (full-page, slide from right, opened from header avatar) -- */
function TenantInfoSheet({
  tenant,
  isOpen,
  onClose,
}: {
  tenant: Tenant;
  isOpen: boolean;
  onClose: () => void;
}) {
  // Build address line from city/country (omit empty parts)
  const addressLine = [tenant.address, tenant.city, tenant.country].filter(Boolean).join(', ');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tenant-info-sheet"
          className="fixed inset-0 z-[62] flex h-dvh max-h-dvh flex-col bg-white"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {/* Top close button */}
          <div className="flex-shrink-0 flex justify-end p-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-app-elevated"
              aria-label="Fermer"
            >
              <X size={18} color={C.textPrimary} />
            </Button>
          </div>

          {/* Hero: large logo + name */}
          <div className="flex-shrink-0 flex flex-col items-center px-6 pb-4">
            <div
              className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center"
              style={{
                backgroundColor: C.surfaceAlt,
              }}
            >
              {tenant.logo_url ? (
                <Image
                  src={tenant.logo_url}
                  alt={tenant.name}
                  width={96}
                  height={96}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span
                  className="text-4xl font-bold"
                  style={{
                    color: C.textMuted,
                  }}
                >
                  {tenant.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h2
              className="mt-4 text-center font-bold text-2xl leading-[32px]"
              style={{ color: C.textPrimary }}
            >
              {tenant.name}
            </h2>
            {tenant.establishment_type && (
              <p
                className="mt-1 text-center font-normal uppercase text-[11px] tracking-[1px]"
                style={{
                  color: C.textMuted,
                }}
              >
                {tenant.establishment_type}
              </p>
            )}
          </div>

          {/* Body: description + contact rows */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {tenant.description && (
              <p className="mt-2 text-[15px] leading-[22px]" style={{ color: C.textSecondary }}>
                {tenant.description}
              </p>
            )}

            {/* Contact rows */}
            <div className="mt-6 flex flex-col gap-3">
              {addressLine && (
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: C.surfaceAlt,
                    }}
                  >
                    <MapPin size={16} color={C.textPrimary} />
                  </div>
                  <span
                    className="text-sm leading-9"
                    style={{
                      color: C.textPrimary,
                    }}
                  >
                    {addressLine}
                  </span>
                </div>
              )}
              {tenant.phone && (
                <a href={`tel:${tenant.phone}`} className="flex items-center gap-3 no-underline">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: C.surfaceAlt,
                    }}
                  >
                    <Phone size={16} color={C.textPrimary} />
                  </div>
                  <span
                    className="text-sm font-bold"
                    style={{
                      color: C.textPrimary,
                    }}
                  >
                    {tenant.phone}
                  </span>
                </a>
              )}
              {tenant.establishment_type &&
                !tenant.description &&
                !addressLine &&
                !tenant.phone && (
                  <div className="flex items-center gap-3 mt-2">
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        backgroundColor: C.surfaceAlt,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Building2 size={16} color={C.textPrimary} />
                    </div>
                    <span
                      className="text-sm"
                      style={{
                        color: C.textPrimary,
                      }}
                    >
                      {tenant.establishment_type}
                    </span>
                  </div>
                )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function ClientMenuPage({
  tenant,
  openingState = { isOpen: true, nextOpenAt: null },
  menus = [],
  initialTable,
  categories,
  ads,
  zones,
  tables,
  announcement,
  announcements = [],
  featuredItems = [],
  recentItems = [],
  discountedItems = [],
  coupons = [],
  ordersThisWeek = null,
  ratingAgg = null,
  recommendedItems = [],
}: ClientMenuPageProps) {
  const t = useTranslations('tenant');
  const lang = typeof window !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'fr';

  const router = useRouter();
  const { toast } = useToast();
  const { items: cartItems, grandTotal } = useCartData();
  const { formatDisplayPrice, resolveAndFormatPrice } = useDisplayCurrency();
  const totalCartItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Keep coupons referenced (used to decide discount section visibility)
  void coupons;

  // Refonte Phase 1: QR-locked table strict. `zones`/`tables` props are kept
  // in the contract but no longer drive an interactive TablePicker - the
  // table is read-only (derived from the QR param `initialTable` or the
  // localStorage fallback). The picker is scheduled for removal in Phase 2.
  void zones;
  void tables;

  const [isTenantInfoOpen, setIsTenantInfoOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  type HomeDietFilter = 'all' | 'vegetarian' | 'spicy' | 'glutenFree' | 'vegan';
  const [dietFilter, setDietFilter] = useState<HomeDietFilter>('all');
  const matchesDiet = (item: MenuItem): boolean => {
    if (dietFilter === 'all') return true;
    if (dietFilter === 'vegetarian') return !!item.is_vegetarian;
    if (dietFilter === 'spicy') return !!item.is_spicy;
    if (dietFilter === 'glutenFree') {
      const a = (item.allergens || []).map((x) => x.toLowerCase());
      return !a.some((x) => x.includes('gluten') || x.includes('wheat'));
    }
    if (dietFilter === 'vegan') {
      const a = (item.allergens || []).map((x) => x.toLowerCase());
      const hasAnimal = a.some((x) =>
        ['milk', 'lait', 'lactose', 'egg', 'oeuf', 'fish', 'poisson', 'meat', 'viande'].some((k) =>
          x.includes(k),
        ),
      );
      return !!item.is_vegetarian && !hasAnimal;
    }
    return true;
  };
  // Read-only table number: QR param first, localStorage fallback. No setter
  // is exposed - changing the table requires re-scanning a QR code.
  const [tableNumber] = useState<string | null>(() => {
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

  const locationName = tableNumber ? t('dineInTable', { number: tableNumber }) : tenant.name;

  // Merge announcement + announcements array (keep backward compat)
  const allAnnouncements: Announcement[] =
    announcements.length > 0 ? announcements : announcement ? [announcement] : [];

  // Reorder items: items from cart (represents current/last session)
  const reorderItems: MenuItem[] = (() => {
    if (totalCartItems === 0) return [];
    const ids = new Set(cartItems.map((ci) => ci.id));
    return featuredItems.filter((it) => ids.has(it.id)).slice(0, 10);
  })();

  const filteredFeatured = featuredItems.filter(matchesDiet);
  const filteredRecent = recentItems.filter(matchesDiet);
  const filteredDiscounted = discountedItems.filter(matchesDiet);
  const filteredReorder = reorderItems.filter(matchesDiet);
  const filteredRecommended = recommendedItems.filter(matchesDiet);

  // Deduped flat list of items for inline search overlay
  const searchableItems: MenuItem[] = (() => {
    const seen = new Set<string>();
    const out: MenuItem[] = [];
    for (const item of [...featuredItems, ...recentItems, ...discountedItems]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
    return out;
  })();

  const hasAnyContent =
    categories.length > 0 ||
    menus.length > 0 ||
    featuredItems.length > 0 ||
    recentItems.length > 0 ||
    discountedItems.length > 0 ||
    ads.length > 0 ||
    allAnnouncements.length > 0;

  return (
    <div
      className="tenant-client w-full max-w-[430px] mx-auto h-full relative flex flex-col"
      style={{
        background: C.background,
      }}
    >
      <FullscreenSplash
        tenantName={tenant.name}
        logoUrl={tenant.logo_url}
        primaryColor={C.primary}
      />

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto pb-20"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        {/* 1. Header - location now opens venue info (QR-locked table). */}
        <HeaderBar
          locationName={locationName}
          logoUrl={tenant.logo_url ?? null}
          tenantName={tenant.name}
          onLocationPress={() => setIsTenantInfoOpen(true)}
          onAvatarPress={() => setIsTenantInfoOpen(true)}
        />

        {/* Refonte: read-only table pill sourced from the QR param. */}
        <div className="px-4 pt-2">
          <LockedTablePill
            tableNumber={tableNumber}
            lockedLabel={t('refonteTableLocked')}
            noTableLabel={t('refonteNoTable')}
            rescanLabel={t('refonteRescanQr')}
            onRescan={() => router.push(`/sites/${tenant.slug}?scan=1`)}
          />
        </div>

        {/* Refonte: editorial chef's pick hero from the first featured item. */}
        {featuredItems[0] && (
          <div className="px-4 pt-4">
            <HeroChefPick
              item={featuredItems[0]}
              eyebrow={t('refonteChefPick')}
              ctaLabel={t('refonteAddToCart')}
              onSelect={(item) => setSelectedItem(item)}
              language={lang}
            />
          </div>
        )}

        {/* Closed banner (when tenant is outside opening hours) */}
        {!openingState.isOpen && (
          <div className="bg-gray-900 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-normal">
            <Clock size={16} />
            <span>{t('closedNow')}</span>
            {openingState.nextOpenAt && (
              <span className="text-gray-300">
                {t('opensAt', { time: openingState.nextOpenAt })}
              </span>
            )}
          </div>
        )}

        {/* Trust signals: tenant-wide rating + social proof */}
        {(ratingAgg || ordersThisWeek) && (
          <div className="px-4 pt-1 pb-2 flex items-center gap-3 text-[12px] text-gray-600">
            {ratingAgg && (
              <span className="flex items-center gap-1">
                <Star size={13} className="fill-amber-500 text-amber-500" />
                <span className="font-bold text-gray-900">{ratingAgg.avg}</span>
                <span className="text-gray-500">({ratingAgg.count})</span>
              </span>
            )}
            {ratingAgg && ordersThisWeek ? <span className="text-gray-300">-</span> : null}
            {ordersThisWeek && (
              <span className="flex items-center gap-1">
                <TrendingUp size={13} className="text-emerald-600" />
                <span>{t('ordersThisWeek', { count: ordersThisWeek })}</span>
              </span>
            )}
          </div>
        )}

        {/* 2. Search */}
        <SearchBar placeholder={t('searchPlaceholder')} onClick={() => setIsSearchOpen(true)} />

        {/* 3. Promo banner carousel */}
        <PromoBanner announcements={allAnnouncements} ads={ads} lang={lang} />

        {/* Global empty state when tenant has no content at all */}
        {!hasAnyContent && (
          <div className="px-4 pt-10">
            <EmptyState
              icon={UtensilsCrossed}
              title={t('emptyMenu.title')}
              description={t('emptyMenu.description')}
            />
          </div>
        )}

        {/* 4. Categories visual grid - primary entry point, shown first */}
        {categories.length > 0 && (
          <>
            <SectionHeader title={t('browseCategories')} />
            <CategoryGrid
              categories={categories}
              lang={lang}
              onSelect={(cat) =>
                router.push(`/sites/${tenant.slug}/menu?section=${encodeURIComponent(cat.name)}`)
              }
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
          </>
        )}

        {/* 5. Nos Cartes (only if > 1 menu - tenants with a single carte rely on the
            categories grid above as the main entry point). Click navigates to the
            menu detail page filtered by the chosen carte via ?menu=<slug>. */}
        {menus.length > 1 && (
          <>
            <SectionHeader title={t('ourMenus')} />
            <HScroll>
              {menus.map((menu) => (
                <MenuCard
                  key={menu.id}
                  menu={menu}
                  lang={lang}
                  onClick={() => router.push(`/sites/${tenant.slug}/menu?menu=${menu.slug}`)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* Diet chips filter row - shown only when we have items to filter */}
        {(featuredItems.length > 0 || recentItems.length > 0 || discountedItems.length > 0) && (
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
            {(
              [
                { key: 'all', label: t('dietAll') },
                { key: 'vegetarian', label: t('dietVegetarian') },
                { key: 'spicy', label: t('dietSpicy') },
                { key: 'glutenFree', label: t('dietGlutenFree') },
                { key: 'vegan', label: t('dietVegan') },
              ] as { key: HomeDietFilter; label: string }[]
            ).map((chip) => {
              const isActive = dietFilter === chip.key;
              return (
                <Button
                  key={chip.key}
                  variant="ghost"
                  onClick={() => setDietFilter(chip.key)}
                  className="flex-shrink-0 whitespace-nowrap h-auto px-4 py-2 rounded-full text-[11px] font-normal uppercase tracking-wider"
                  style={{
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

        {/* 6. Populaires */}
        {filteredFeatured.length > 0 && (
          <>
            <SectionHeader
              title={t('mostOrdered')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredFeatured.map((item) => (
                <FeaturedItemCard
                  key={item.id}
                  item={item}
                  lang={lang}
                  badge="none"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 7. Nouveautes */}
        {filteredRecent.length > 0 && (
          <>
            <SectionHeader
              title={t('newOnMenu')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredRecent.map((item) => (
                <FeaturedItemCard
                  key={item.id}
                  item={item}
                  lang={lang}
                  badge="new"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 8. Promotions (only if coupons active and discounted items) */}
        {filteredDiscounted.length > 0 && (
          <>
            <SectionHeader
              title={t('todayDeals')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredDiscounted.map((item) => (
                <FeaturedItemCard
                  key={`promo-${item.id}`}
                  item={item}
                  lang={lang}
                  badge="promo"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 9. Commander a nouveau */}
        {filteredReorder.length > 0 && (
          <>
            <SectionHeader
              title={t('orderAgain')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/cart`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredReorder.map((item) => (
                <FeaturedItemCard
                  key={`reorder-${item.id}`}
                  item={item}
                  lang={lang}
                  badge="none"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 10. Recommande pour vous (co-ordered items from order history) */}
        {filteredRecommended.length > 0 && (
          <>
            <SectionHeader
              title={t('recommendedTitle')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {filteredRecommended.map((item) => (
                <FeaturedItemCard
                  key={`reco-${item.id}`}
                  item={item}
                  lang={lang}
                  badge="none"
                  price={resolveAndFormatPrice(item.price, item.prices, tenant.currency)}
                  onPress={() => setSelectedItem(item)}
                  onAdd={() => setSelectedItem(item)}
                />
              ))}
            </HScroll>
          </>
        )}
      </div>

      {/* Floating Cart Bar */}
      <FloatingCartBar
        totalItems={totalCartItems}
        totalPrice={formatDisplayPrice(grandTotal, tenant.currency)}
        href={`/sites/${tenant.slug}/cart`}
        viewCartLabel={t('viewCart')}
      />

      {/* Modals */}
      <TenantInfoSheet
        tenant={tenant}
        isOpen={isTenantInfoOpen}
        onClose={() => setIsTenantInfoOpen(false)}
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
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        items={searchableItems}
        restaurantId={tenant.id}
        currency={tenant.currency ?? undefined}
        onOpenDetail={(item) => {
          setIsSearchOpen(false);
          setSelectedItem(item);
        }}
      />
      <BottomNav tenantSlug={tenant.slug} />
    </div>
  );
}
