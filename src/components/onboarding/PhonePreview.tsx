/* eslint-disable @next/next/no-img-element */
'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  Clock,
  Coffee,
  Fish,
  Flame,
  GlassWater,
  Home,
  Leaf,
  MapPin,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Star,
  User,
  Utensils,
  Wine,
} from 'lucide-react';

import type { OnboardingData } from '@/app/onboarding/page';

// ─── Icon mapping (mirrors category-icons config) ───────────────────────────

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  entree: Leaf,
  entrée: Leaf,
  starters: Leaf,
  'pour commencer': Leaf,
  burger: Utensils,
  burgers: Utensils,
  hamburger: Utensils,
  pizza: Utensils,
  pizzas: Utensils,
  pates: Utensils,
  pâtes: Utensils,
  pasta: Utensils,
  grillade: Flame,
  grills: Flame,
  'du grill': Flame,
  'plat principal': Utensils,
  'main course': Utensils,
  plats: Utensils,
  vegetarien: Leaf,
  végétarien: Leaf,
  vegetarian: Leaf,
  dessert: Utensils,
  desserts: Utensils,
  douceurs: Utensils,
  boisson: GlassWater,
  boissons: GlassWater,
  drinks: GlassWater,
  cocktail: Wine,
  cocktails: Wine,
  aperitif: Wine,
  apéritif: Wine,
  cafe: Coffee,
  café: Coffee,
  coffee: Coffee,
  africain: Utensils,
  african: Utensils,
  'plats africains': Utensils,
  poisson: Fish,
  fish: Fish,
  seafood: Fish,
  salade: Leaf,
  salad: Leaf,
  soupe: Utensils,
  soup: Utensils,
  vin: Wine,
  wine: Wine,
  biere: GlassWater,
  bière: GlassWater,
  beer: GlassWater,
};

function getCategoryIcon(name: string): LucideIcon {
  const lower = name.toLowerCase().trim();
  if (CATEGORY_ICONS[lower]) return CATEGORY_ICONS[lower];
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (lower.includes(key) || key.includes(lower)) return icon;
  }
  return Utensils;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface PhonePreviewProps {
  data: OnboardingData;
  phase: number;
}

// ─── Tokens (mirrors menu-tokens.ts exactly) ────────────────────────────────

const C = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F6F6',
  divider: '#EEEEEE',
  textPrimary: '#1A1A1A',
  textSecondary: '#737373',
  textMuted: '#B0B0B0',
  primary: '#1A1A1A',
  cartBg: '#1A1A1A',
  iconInactive: '#B0B0B0',
  rating: '#FFB800',
  skeletonAlt: '#F3F4F6',
};

// Scale factor: preview phone 256px / real max-w 430px
const S = 256 / 430;

// ─── Component ──────────────────────────────────────────────────────────────

export function PhonePreview({ data, phase }: PhonePreviewProps) {
  const t = useTranslations('onboarding');
  const { logoUrl, tenantName, menuItems, currency } = data;

  const initial = (tenantName || 'M').charAt(0).toUpperCase();
  const locationName = tenantName || t('phoneSurPlace');

  const categories = useMemo(() => {
    if (!menuItems || menuItems.length === 0) return [];
    const seen = new Set<string>();
    const cats: Array<{ name: string; Icon: LucideIcon }> = [];
    for (const item of menuItems) {
      const cat = item.category || 'Menu';
      if (!seen.has(cat)) {
        seen.add(cat);
        cats.push({ name: cat, Icon: getCategoryIcon(cat) });
      }
    }
    return cats;
  }, [menuItems]);

  const displayItems = useMemo(() => (menuItems ?? []).slice(0, 4), [menuItems]);
  const hasMenu = phase >= 2 && menuItems && menuItems.length > 0;

  const navH = Math.round(60 * S);

  return (
    <div className="relative flex items-center justify-center">
      {/* ── Phone shell ─────────────────────────────── */}
      <div className="relative w-[256px] h-[512px] rounded-[40px] border-2 border-[#D1D5DB] bg-black overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)_inset]">
        {/* Dynamic island */}
        <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-16 h-4 bg-black rounded-full z-20" />

        {/* ── Screen ────────────────────────────────── */}
        <div
          className="absolute inset-[2px] rounded-[38px] overflow-hidden flex flex-col"
          style={{ backgroundColor: C.bg }}
        >
          {/* ── Scrollable content ──────────────────── */}
          <div className="flex-1 overflow-y-auto [scrollbar-width:none]">
            {/* Safe area top */}
            <div style={{ height: '30px' }} />

            {/* ─── 1. HEADER ─── two-line: "VOUS ETES A" + name ─── */}
            <div
              style={{
                height: Math.round(64 * S) + 'px',
                paddingLeft: '10px',
                paddingRight: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: C.bg,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1px',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {/* Row 1: pin icon + "VOUS ETES A" */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <MapPin
                    style={{ width: '6px', height: '6px', flexShrink: 0 }}
                    fill={C.textMuted}
                    stroke="none"
                  />
                  <span
                    style={{
                      fontSize: '5px',
                      fontWeight: 600,
                      color: C.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {t('phoneYouAreAt')}
                  </span>
                </div>
                {/* Row 2: restaurant name + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <span
                    style={{
                      fontSize: Math.round(15 * S) + 'px',
                      fontWeight: 700,
                      color: C.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '110px',
                    }}
                  >
                    {locationName}
                  </span>
                  <ChevronDown
                    style={{ width: '7px', height: '7px', color: C.textPrimary, flexShrink: 0 }}
                    strokeWidth={2}
                  />
                </div>
              </div>

              {/* Avatar — bg always surfaceAlt */}
              <div
                style={{
                  width: Math.round(40 * S) + 'px',
                  height: Math.round(40 * S) + 'px',
                  borderRadius: '50%',
                  backgroundColor: C.surfaceAlt,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: C.textMuted,
                      lineHeight: 1,
                    }}
                  >
                    {initial}
                  </span>
                )}
              </div>
            </div>

            {/* ─── 2. SEARCH BAR ─── with QR scanner button on right ─── */}
            <div
              style={{
                paddingLeft: '10px',
                paddingRight: '10px',
                marginTop: '4px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  height: Math.round(48 * S) + 'px',
                  backgroundColor: C.surfaceAlt,
                  borderRadius: '7px',
                  paddingLeft: '9px',
                  paddingRight: '6px',
                }}
              >
                <Search
                  style={{ width: '10px', height: '10px', color: C.textMuted, flexShrink: 0 }}
                  strokeWidth={2}
                />
                <span style={{ fontSize: '7px', color: C.textMuted, fontWeight: 400, flex: 1 }}>
                  {t('phoneSearchPlaceholder')}
                </span>
                {/* QR dark square button */}
                <div
                  style={{
                    width: Math.round(32 * S) + 'px',
                    height: Math.round(32 * S) + 'px',
                    backgroundColor: C.cartBg,
                    borderRadius: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <QrCode
                    style={{ width: '9px', height: '9px', color: '#FFFFFF' }}
                    strokeWidth={1.5}
                  />
                </div>
              </div>
            </div>

            {/* ─── 3. PROMO BANNER ─── */}
            <div
              style={{
                paddingLeft: '10px',
                paddingRight: '10px',
                marginTop: '10px',
              }}
            >
              <div
                style={{
                  height: Math.round(160 * S) + 'px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  position: 'relative',
                  background: 'linear-gradient(135deg, #111827 0%, #1a3a2a 60%, #0d1f17 100%)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 60%)',
                  }}
                />
                <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px' }}>
                  <span
                    style={{
                      fontSize: '5px',
                      fontWeight: 600,
                      color: '#86EFAC',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      display: 'block',
                      marginBottom: '2px',
                    }}
                  >
                    {t('phoneBannerLabel')}
                  </span>
                  <p
                    style={{
                      fontSize: Math.round(20 * S) + 'px',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      margin: '0 0 2px',
                      lineHeight: 1.2,
                    }}
                  >
                    {t('phoneBannerTitle')}
                  </p>
                  <p
                    style={{
                      fontSize: '6px',
                      color: 'rgba(255,255,255,0.55)',
                      margin: '0 0 5px',
                    }}
                  >
                    {t('phoneBannerSubtitle')}
                  </p>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      borderRadius: '999px',
                      paddingLeft: '6px',
                      paddingRight: '7px',
                      paddingTop: '2px',
                      paddingBottom: '2px',
                    }}
                  >
                    <div
                      style={{
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        backgroundColor: '#86EFAC',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: '5px', color: '#FFFFFF', fontWeight: 500 }}>
                      {t('phoneBannerOpen')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── 4. ANNOUNCEMENT CARD (mint green) ─── */}
            <div
              style={{
                paddingLeft: '10px',
                paddingRight: '10px',
                marginTop: '8px',
              }}
            >
              <div
                style={{
                  backgroundColor: '#D1FAE5',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '6px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: Math.round(14 * S) + 'px',
                      fontWeight: 700,
                      color: '#064E3B',
                      margin: '0 0 2px',
                      lineHeight: 1.2,
                    }}
                  >
                    {t('phoneAnnounceSample')}
                  </p>
                  <p
                    style={{
                      fontSize: '6px',
                      color: '#065F46',
                      margin: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {t('phoneAnnounceBody')}
                  </p>
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    backgroundColor: '#064E3B',
                    borderRadius: '5px',
                    paddingLeft: '7px',
                    paddingRight: '7px',
                    paddingTop: '4px',
                    paddingBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: '6px',
                      fontWeight: 600,
                      color: '#FFFFFF',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('phoneAnnounceCta')} &gt;
                  </span>
                </div>
              </div>
            </div>

            {/* ─── 5. CATEGORIES ─── with "Tout voir >" in header ─── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: '10px',
                paddingRight: '10px',
                paddingTop: '10px',
                paddingBottom: '6px',
              }}
            >
              <span
                style={{
                  fontSize: Math.round(20 * S) + 'px',
                  fontWeight: 700,
                  color: C.textPrimary,
                }}
              >
                {t('phoneCategoriesLabel')}
              </span>
              <span style={{ fontSize: '6px', fontWeight: 600, color: C.primary }}>
                {t('phoneSeeAll')} &gt;
              </span>
            </div>

            {/* CategoryGrid: grid-cols-4 */}
            <div style={{ paddingLeft: '10px', paddingRight: '10px' }}>
              {hasMenu && categories.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {categories.slice(0, 8).map((cat) => {
                    const CatIcon = cat.Icon;
                    return (
                      <div
                        key={cat.name}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '1',
                            backgroundColor: C.surfaceAlt,
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <CatIcon
                            style={{ width: '14px', height: '14px', color: C.textSecondary }}
                            strokeWidth={1.5}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '6px',
                            color: C.textPrimary,
                            textAlign: 'center',
                            lineHeight: 1.2,
                            width: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cat.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Skeleton category grid */
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i}>
                      <div
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          backgroundColor: C.skeletonAlt,
                          borderRadius: '8px',
                          marginBottom: '3px',
                        }}
                      />
                      <div
                        style={{
                          height: '5px',
                          backgroundColor: C.skeletonAlt,
                          borderRadius: '999px',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── 6. POPULAR ITEMS ─── with "Tout voir >" in header ─── */}
            {hasMenu && displayItems.length > 0 && (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingLeft: '10px',
                    paddingRight: '10px',
                    paddingTop: '10px',
                    paddingBottom: '6px',
                  }}
                >
                  <span
                    style={{
                      fontSize: Math.round(20 * S) + 'px',
                      fontWeight: 700,
                      color: C.textPrimary,
                    }}
                  >
                    {t('phonePopularLabel')}
                  </span>
                  <span style={{ fontSize: '6px', fontWeight: 600, color: C.primary }}>
                    {t('phoneSeeAll')} &gt;
                  </span>
                </div>

                {/* Horizontal scroll of FeaturedItemCards */}
                <div
                  style={{
                    display: 'flex',
                    gap: '6px',
                    overflowX: 'auto',
                    paddingLeft: '10px',
                    paddingRight: '10px',
                    paddingBottom: '4px',
                    scrollbarWidth: 'none',
                  }}
                >
                  {displayItems.map((item, idx) => {
                    const cardW = Math.round(180 * S);
                    const imgH = Math.round(140 * S);
                    return (
                      <div
                        key={idx}
                        style={{
                          width: cardW + 'px',
                          flexShrink: 0,
                          borderRadius: '8px',
                          overflow: 'visible',
                          border: `1px solid ${C.divider}`,
                          backgroundColor: C.surface,
                          display: 'flex',
                          flexDirection: 'column',
                        }}
                      >
                        {/* Image area */}
                        <div
                          style={{
                            width: '100%',
                            height: imgH + 'px',
                            backgroundColor: C.surfaceAlt,
                            borderRadius: '8px 8px 0 0',
                            overflow: 'hidden',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <Utensils
                              style={{ width: '14px', height: '14px', color: C.textMuted }}
                              strokeWidth={1.5}
                            />
                          )}
                          {/* Plus button */}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '-4px',
                              right: '4px',
                              width: Math.round(28 * S) + 'px',
                              height: Math.round(28 * S) + 'px',
                              borderRadius: '50%',
                              backgroundColor: C.cartBg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Plus
                              style={{ width: '7px', height: '7px', color: '#FFFFFF' }}
                              strokeWidth={2.5}
                            />
                          </div>
                        </div>

                        {/* Text area */}
                        <div style={{ padding: '6px 6px 5px' }}>
                          <p
                            style={{
                              fontSize: Math.round(14 * S) + 'px',
                              fontWeight: 600,
                              color: C.textPrimary,
                              margin: '0 0 2px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.name}
                          </p>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '2px',
                              marginBottom: '2px',
                            }}
                          >
                            <Star
                              style={{ width: '7px', height: '7px' }}
                              fill={C.rating}
                              stroke="none"
                            />
                            <span
                              style={{ fontSize: '6px', fontWeight: 500, color: C.textPrimary }}
                            >
                              4.8
                            </span>
                          </div>
                          <p
                            style={{
                              fontSize: Math.round(15 * S) + 'px',
                              fontWeight: 700,
                              color: C.textPrimary,
                              margin: 0,
                            }}
                          >
                            {item.price.toLocaleString()}&nbsp;{currency || 'FCFA'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Spacer above bottom nav */}
            <div style={{ height: navH + 8 + 'px' }} />
          </div>

          {/* ─── BOTTOM NAV ─── 5 tabs: Home / Orders / [Cart FAB] / Menu / Account ─── */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: navH + 'px',
              backgroundColor: C.bg,
              borderTop: `1px solid ${C.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              paddingLeft: '4px',
              paddingRight: '4px',
              zIndex: 40,
            }}
          >
            {/* Accueil */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1px',
                flex: 1,
              }}
            >
              <Home
                style={{ width: '13px', height: '13px', color: C.textPrimary }}
                strokeWidth={2}
              />
              <span style={{ fontSize: '5px', fontWeight: 500, color: C.textPrimary }}>
                {t('phoneNavHome')}
              </span>
            </div>

            {/* Commandes */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1px',
                flex: 1,
              }}
            >
              <Clock
                style={{ width: '13px', height: '13px', color: C.iconInactive }}
                strokeWidth={2}
              />
              <span style={{ fontSize: '5px', fontWeight: 500, color: C.iconInactive }}>
                {t('phoneNavOrders')}
              </span>
            </div>

            {/* Center Cart FAB */}
            <div
              style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              <div
                style={{
                  width: navH - 6 + 'px',
                  height: navH - 6 + 'px',
                  borderRadius: '50%',
                  backgroundColor: C.cartBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}
              >
                <ShoppingBag
                  style={{ width: '12px', height: '12px', color: '#FFFFFF' }}
                  strokeWidth={2}
                />
              </div>
            </div>

            {/* Menu */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1px',
                flex: 1,
              }}
            >
              <Utensils
                style={{ width: '13px', height: '13px', color: C.iconInactive }}
                strokeWidth={2}
              />
              <span style={{ fontSize: '5px', fontWeight: 500, color: C.iconInactive }}>
                {t('phoneNavMenu')}
              </span>
            </div>

            {/* Compte */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1px',
                flex: 1,
              }}
            >
              <User
                style={{ width: '13px', height: '13px', color: C.iconInactive }}
                strokeWidth={2}
              />
              <span style={{ fontSize: '5px', fontWeight: 500, color: C.iconInactive }}>
                {t('phoneNavAccount')}
              </span>
            </div>
          </div>

          {/* Home indicator bar */}
          <div
            style={{
              position: 'absolute',
              bottom: '4px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '40px',
              height: '2px',
              borderRadius: '999px',
              backgroundColor: 'rgba(0,0,0,0.12)',
              zIndex: 50,
            }}
          />
        </div>
      </div>
    </div>
  );
}
