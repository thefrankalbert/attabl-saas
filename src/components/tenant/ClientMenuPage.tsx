'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { useCartData } from '@/contexts/CartContext';
import { useDisplayCurrency } from '@/contexts/CurrencyContext';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import type {
  Venue,
  Category,
  Ad,
  Tenant,
  Zone,
  Table,
  Announcement,
  MenuItem,
  Coupon,
} from '@/types/admin.types';
import BottomNav from '@/components/tenant/BottomNav';
import InstallPrompt from '@/components/tenant/InstallPrompt';
import FullscreenSplash from '@/components/tenant/FullscreenSplash';
import ItemDetailSheet from '@/components/tenant/ItemDetailSheet';
import TablePicker from '@/components/tenant/TablePicker';
import type { QRScanResult } from '@/components/tenant/QRScanner';

const QRScanner = dynamic(() => import('@/components/tenant/QRScanner'), {
  ssr: false,
  loading: () => (
    <div className="h-64 animate-pulse" style={{ borderRadius: 12, background: C.surfaceAlt }} />
  ),
});

/* =================================================
   DESIGN SYSTEM - all tokens from DESIGN.md
   ================================================= */
const C = {
  primary: '#06C167',
  primaryDark: '#05A557',
  primaryLight: '#E6F9F0',
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
  return '/category-icons/caribbean.png';
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
      style={{
        height: 56,
        paddingLeft: 16,
        paddingRight: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: C.background,
      }}
    >
      <button
        onClick={onLocationPress}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.75a1.75 1.75 0 110-3.5 1.75 1.75 0 010 3.5z"
            fill={C.primary}
          />
        </svg>
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
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
      </button>

      <button
        onClick={onAvatarPress}
        style={{
          width: 40,
          height: 40,
          borderRadius: 50,
          overflow: 'hidden',
          flexShrink: 0,
          border: 'none',
          cursor: 'pointer',
          padding: 0,
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
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.textMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
            }}
          >
            {tenantName.charAt(0).toUpperCase()}
          </span>
        )}
      </button>
    </div>
  );
}

/* -- Search Bar -- */
function SearchBar({ placeholder, onClick }: { placeholder: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 48,
        margin: '8px 16px 0',
        padding: '0 16px',
        background: C.surfaceAlt,
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        width: 'calc(100% - 32px)',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke={C.textMuted} strokeWidth="2" />
        <path d="M16 16l4 4" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 14, color: C.textMuted }}>{placeholder}</span>
    </button>
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
    <div style={{ marginTop: 20 }}>
      <div
        ref={scrollRef}
        onScroll={() => {
          if (!scrollRef.current) return;
          const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
          setActiveIdx(idx);
        }}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingLeft: 16,
          paddingRight: 16,
          gap: 12,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="scrollbar-hide"
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            style={{
              minWidth: 'calc(100% - 32px)',
              scrollSnapAlign: 'start',
              height: 160,
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
              flexShrink: 0,
            }}
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
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)',
              }}
            />
            <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 2 }}>
              {slide.label && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: C.textOnPrimary,
                    letterSpacing: 1,
                  }}
                >
                  {slide.label}
                </span>
              )}
              {slide.title && (
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: C.textOnPrimary,
                    marginTop: 4,
                    lineHeight: 1.4,
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                width: activeIdx === i ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: activeIdx === i ? C.primary : C.divider,
                transition: 'all 0.2s ease',
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
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 16px 12px',
      }}
    >
      <h2
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: C.textPrimary,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {onSeeAll && seeAllLabel && (
        <button
          onClick={onSeeAll}
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: C.primary,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {seeAllLabel}
        </button>
      )}
    </div>
  );
}

/* -- Horizontal scroll container -- */
function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        overflowX: 'auto',
        gap: 12,
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 4,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
      className="scrollbar-hide"
    >
      {children}
    </div>
  );
}

/* -- Venue Card (horizontal scroll) -- */
function VenueCard({ venue, lang, onClick }: { venue: Venue; lang: string; onClick: () => void }) {
  const name = tr(lang, venue.name, venue.name_en);
  const desc = tr(lang, venue.description || '', venue.description_en);
  return (
    <button
      onClick={onClick}
      style={{
        width: 200,
        flexShrink: 0,
        background: C.surface,
        border: `1px solid ${C.divider}`,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 120,
          position: 'relative',
          background: C.surfaceAlt,
        }}
      >
        {venue.image_url ? (
          <Image
            src={venue.image_url}
            alt={name}
            fill
            sizes="200px"
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
              color: C.textMuted,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div style={{ padding: 12 }}>
        <p
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: C.textPrimary,
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </p>
        {desc && (
          <p
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: C.textSecondary,
              margin: '4px 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {desc}
          </p>
        )}
      </div>
    </button>
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
    <div style={{ padding: '0 16px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        {visible.map((cat) => {
          const label = tr(lang, cat.name, cat.name_en);
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  background: C.surfaceAlt,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
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
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: C.textPrimary,
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={onSeeAll}
          style={{
            display: 'block',
            marginTop: 12,
            marginLeft: 'auto',
            marginRight: 'auto',
            background: 'none',
            border: 'none',
            color: C.primary,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {seeAllLabel}
        </button>
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
      style={{
        width: 180,
        flexShrink: 0,
        background: C.surface,
        border: `1px solid ${C.divider}`,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 140,
          position: 'relative',
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
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
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
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: C.primary,
              color: C.textOnPrimary,
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 8,
              letterSpacing: 0.5,
            }}
          >
            {lang === 'en' ? 'New' : 'Nouveau'}
          </span>
        )}
        {badge === 'promo' && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: C.promo,
              color: C.textOnPrimary,
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 8,
              letterSpacing: 0.5,
            }}
          >
            {lang === 'en' ? 'Deal' : 'Offre'}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          aria-label={t('addShort')}
          style={{
            position: 'absolute',
            bottom: -8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 50,
            background: C.primary,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
        </button>
      </div>
      <div
        style={{ padding: 12, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        <p
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: C.textPrimary,
            margin: 0,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: '19.6px',
            minHeight: '39.2px',
          }}
        >
          {name}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill={C.rating}>
            <path d="M6 0l1.76 3.58L12 4.16 8.88 7.1l.74 4.32L6 9.27 2.38 11.42l.74-4.32L0 4.16l4.24-.58z" />
          </svg>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: C.textPrimary,
            }}
          >
            {rating.toFixed(1)}
          </span>
        </div>
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: C.textPrimary,
            margin: 0,
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
      style={{
        position: 'fixed',
        bottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 16px)',
        left: 16,
        right: 16,
        zIndex: 40,
        maxWidth: 430,
        margin: '0 auto',
      }}
    >
      <Link
        href={href}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 56,
          padding: '0 16px',
          borderRadius: 12,
          background: C.cartBg,
          textDecoration: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.textOnPrimary}
              strokeWidth="2"
            >
              <path
                d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -8,
                background: C.primary,
                color: C.textOnPrimary,
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 50,
                minWidth: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
              }}
            >
              {totalItems}
            </span>
          </div>
        </div>
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: C.textOnPrimary,
          }}
        >
          {viewCartLabel}
        </span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
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
  venues: Venue[];
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
}

/* =================================================
   MAIN COMPONENT
   ================================================= */

export default function ClientMenuPage({
  tenant,
  venues,
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

  return (
    <div
      className="tenant-client"
      style={{
        width: '100%',
        maxWidth: 430,
        margin: '0 auto',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
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
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 80,
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        {/* 1. Header */}
        <HeaderBar
          locationName={locationName}
          logoUrl={tenant.logo_url ?? null}
          tenantName={tenant.name}
          onLocationPress={() => setIsTablePickerOpen(true)}
          onAvatarPress={() => setIsQRScannerOpen(true)}
        />

        {/* 2. Search */}
        <SearchBar
          placeholder={t('searchPlaceholder')}
          onClick={() => router.push(`/sites/${tenant.slug}/menu`)}
        />

        {/* 3. Promo banner carousel */}
        <PromoBanner announcements={allAnnouncements} ads={ads} lang={lang} />

        {/* 4. Nos Restaurants (only if > 1 venue) */}
        {venues.length > 1 && (
          <>
            <SectionHeader title={t('ourRestaurants')} />
            <HScroll>
              {venues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  lang={lang}
                  onClick={() => router.push(`/sites/${tenant.slug}/menu?v=${venue.slug}`)}
                />
              ))}
            </HScroll>
          </>
        )}

        {/* 5. Categories visual grid */}
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

        {/* 6. Populaires */}
        {featuredItems.length > 0 && (
          <>
            <SectionHeader
              title={t('mostOrdered')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {featuredItems.map((item) => (
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
        {recentItems.length > 0 && (
          <>
            <SectionHeader
              title={t('newOnMenu')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {recentItems.map((item) => (
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
        {discountedItems.length > 0 && (
          <>
            <SectionHeader
              title={t('todayDeals')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/menu`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {discountedItems.map((item) => (
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
        {reorderItems.length > 0 && (
          <>
            <SectionHeader
              title={t('orderAgain')}
              onSeeAll={() => router.push(`/sites/${tenant.slug}/cart`)}
              seeAllLabel={t('seeAll')}
            />
            <HScroll>
              {reorderItems.map((item) => (
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
      </div>

      {/* Floating Cart Bar */}
      <FloatingCartBar
        totalItems={totalCartItems}
        totalPrice={formatDisplayPrice(grandTotal, tenant.currency)}
        href={`/sites/${tenant.slug}/cart`}
        viewCartLabel={`${t('viewCart')} - ${totalCartItems}`}
      />

      {/* Modals */}
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
