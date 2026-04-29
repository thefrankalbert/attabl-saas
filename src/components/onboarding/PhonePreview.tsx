/* eslint-disable @next/next/no-img-element */
'use client';

import { useMemo } from 'react';
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
  Search,
  ShoppingBag,
  User,
  Utensils,
  Wine,
} from 'lucide-react';

import type { OnboardingData } from '@/app/onboarding/page';

// ─── Icon mapping (mirrors CategoryGrid categories) ────────────────────────

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

// ─── Tokens (mirrors menu-tokens.ts) ────────────────────────────────────────

const C = {
  bg: '#FFFFFF',
  surface: '#F6F6F6',
  divider: '#EEEEEE',
  text: '#1A1A1A',
  textSecondary: '#737373',
  textMuted: '#B0B0B0',
  cartBg: '#1A1A1A',
  cartText: '#FFFFFF',
  iconInactive: '#B0B0B0',
  skeletonBase: '#E5E7EB',
  skeletonAlt: '#F3F4F6',
};

// ─── Component ──────────────────────────────────────────────────────────────

export function PhonePreview({ data, phase }: PhonePreviewProps) {
  const { logoUrl, tenantName, menuItems, currency, primaryColor } = data;
  const accentColor = primaryColor || C.cartBg;

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

  const displayItems = useMemo(() => (menuItems ?? []).slice(0, 5), [menuItems]);

  const hasMenu = phase >= 2 && menuItems && menuItems.length > 0;
  const initial = (tenantName || 'M').charAt(0).toUpperCase();

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
            {/* Safe area top (dynamic island) */}
            <div className="h-[30px]" />

            {/* ─── HEADER ─── location left / logo right */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: '33px',
                paddingLeft: '12px',
                paddingRight: '12px',
              }}
            >
              {/* Location picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <MapPin style={{ width: '9px', height: '9px', color: C.text }} strokeWidth={2} />
                <span style={{ fontSize: '8px', fontWeight: 600, color: C.text }}>Sur place</span>
                <ChevronDown
                  style={{ width: '8px', height: '8px', color: C.text }}
                  strokeWidth={2}
                />
              </div>

              {/* Restaurant logo avatar */}
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: C.surface,
                  border: `1px solid ${C.divider}`,
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
                      fontSize: '11px',
                      fontWeight: 700,
                      color: C.text,
                      lineHeight: 1,
                    }}
                  >
                    {initial}
                  </span>
                )}
              </div>
            </div>

            {/* ─── SEARCH BAR ─── */}
            <div
              style={{
                paddingLeft: '12px',
                paddingRight: '12px',
                paddingBottom: '10px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '28px',
                  backgroundColor: C.surface,
                  borderRadius: '8px',
                  paddingLeft: '10px',
                  paddingRight: '10px',
                }}
              >
                <Search
                  style={{ width: '10px', height: '10px', color: C.textMuted }}
                  strokeWidth={2}
                />
                <span
                  style={{
                    fontSize: '8px',
                    color: C.textMuted,
                    fontWeight: 500,
                  }}
                >
                  Chercher un plat...
                </span>
              </div>
            </div>

            {/* ─── CATEGORY GRID ─── 4 colonnes, tuiles carrées */}
            <div
              style={{
                paddingLeft: '12px',
                paddingRight: '12px',
                paddingBottom: '8px',
              }}
            >
              {hasMenu && categories.length > 0 ? (
                <>
                  <p
                    style={{
                      fontSize: '8px',
                      fontWeight: 700,
                      color: C.text,
                      marginBottom: '6px',
                    }}
                  >
                    Catégories
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '5px',
                    }}
                  >
                    {categories.slice(0, 8).map((cat) => (
                      <div
                        key={cat.name}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '1',
                            backgroundColor: C.surface,
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {(() => {
                            const CatIcon = cat.Icon;
                            return (
                              <CatIcon
                                style={{ width: '14px', height: '14px', color: C.textSecondary }}
                                strokeWidth={1.5}
                              />
                            );
                          })()}
                        </div>
                        <span
                          style={{
                            fontSize: '6px',
                            color: C.textSecondary,
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
                    ))}
                  </div>
                </>
              ) : (
                /* Skeleton catégories */
                <>
                  <div
                    style={{
                      height: '8px',
                      width: '48px',
                      backgroundColor: C.skeletonBase,
                      borderRadius: '999px',
                      marginBottom: '6px',
                    }}
                  />
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '5px',
                    }}
                  >
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
                </>
              )}
            </div>

            {/* ─── CATEGORY NAV PILLS (sticky dans l'app réelle) ─── */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                paddingLeft: '12px',
                paddingRight: '12px',
                paddingTop: '4px',
                paddingBottom: '8px',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                borderBottom: `1px solid ${C.divider}`,
                marginBottom: '8px',
              }}
            >
              {hasMenu && categories.length > 0
                ? categories.slice(0, 6).map((cat, i) => (
                    <div
                      key={cat.name}
                      style={{
                        flexShrink: 0,
                        backgroundColor: i === 0 ? accentColor : C.surface,
                        borderRadius: '999px',
                        paddingLeft: '7px',
                        paddingRight: '7px',
                        paddingTop: '3px',
                        paddingBottom: '3px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '7px',
                          fontWeight: 600,
                          color: i === 0 ? C.cartText : C.textSecondary,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cat.name}
                      </span>
                    </div>
                  ))
                : /* Skeleton pills */
                  [52, 40, 56, 36].map((w, i) => (
                    <div
                      key={i}
                      style={{
                        flexShrink: 0,
                        width: `${w}px`,
                        height: '18px',
                        backgroundColor: i === 0 ? C.skeletonBase : C.skeletonAlt,
                        borderRadius: '999px',
                      }}
                    />
                  ))}
            </div>

            {/* ─── ITEMS LIST ─── image droite / texte gauche (MenuItemCard) */}
            <div style={{ paddingLeft: '12px', paddingRight: '12px' }}>
              {hasMenu
                ? displayItems.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        paddingBottom: '10px',
                        marginBottom: '8px',
                        borderBottom:
                          idx < displayItems.length - 1 ? `1px solid ${C.divider}` : 'none',
                      }}
                    >
                      {/* Texte — gauche */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            color: C.text,
                            lineHeight: 1.3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            marginBottom: '2px',
                          }}
                        >
                          {item.name}
                        </p>
                        {item.category && (
                          <p
                            style={{
                              fontSize: '7px',
                              color: C.textSecondary,
                              lineHeight: 1.3,
                              marginBottom: '4px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.category}
                          </p>
                        )}
                        <p
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            color: C.text,
                          }}
                        >
                          {item.price.toLocaleString()}&nbsp;{currency || 'FCFA'}
                        </p>
                      </div>

                      {/* Image — droite (w-90px → 53px scaled) */}
                      <div
                        style={{
                          position: 'relative',
                          flexShrink: 0,
                          width: '53px',
                          height: '53px',
                        }}
                      >
                        <div
                          style={{
                            width: '53px',
                            height: '53px',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            backgroundColor: C.surface,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                            />
                          ) : (
                            <Utensils
                              style={{
                                width: '18px',
                                height: '18px',
                                color: C.textMuted,
                              }}
                              strokeWidth={1.5}
                            />
                          )}
                        </div>
                        {/* Bouton (+) noir */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '-3px',
                            right: '-3px',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: C.cartBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Plus
                            style={{
                              width: '10px',
                              height: '10px',
                              color: C.cartText,
                            }}
                            strokeWidth={2.5}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                : /* Skeleton items */
                  [1, 2, 3].map((i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        paddingBottom: '10px',
                        marginBottom: '8px',
                        borderBottom: `1px solid ${C.divider}`,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            height: '8px',
                            width: `${50 + i * 18}%`,
                            backgroundColor: C.skeletonBase,
                            borderRadius: '4px',
                            marginBottom: '4px',
                          }}
                        />
                        <div
                          style={{
                            height: '6px',
                            width: '70%',
                            backgroundColor: C.skeletonAlt,
                            borderRadius: '4px',
                            marginBottom: '5px',
                          }}
                        />
                        <div
                          style={{
                            height: '8px',
                            width: '38%',
                            backgroundColor: C.skeletonBase,
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                      <div
                        style={{
                          flexShrink: 0,
                          width: '53px',
                          height: '53px',
                          borderRadius: '10px',
                          backgroundColor: C.skeletonAlt,
                        }}
                      />
                    </div>
                  ))}
            </div>

            {/* Spacer bottom (cart bar + bottom nav) */}
            <div className="h-[90px]" />
          </div>

          {/* ─── FLOATING CART BAR ─── noir, rounded-full (FloatingCartBar.tsx) */}
          {hasMenu && (
            <div
              style={{
                position: 'absolute',
                left: '10px',
                right: '10px',
                bottom: '44px',
                height: '30px',
                backgroundColor: accentColor,
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                zIndex: 30,
                boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
              }}
            >
              <ShoppingBag
                style={{ width: '11px', height: '11px', color: C.cartText }}
                strokeWidth={2}
              />
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: 600,
                  color: C.cartText,
                  whiteSpace: 'nowrap',
                }}
              >
                Voir le panier
              </span>
              {/* Separator dot */}
              <span
                style={{
                  width: '3px',
                  height: '3px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255,255,255,0.5)',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  color: C.cartText,
                  whiteSpace: 'nowrap',
                }}
              >
                {displayItems.length}&nbsp;•&nbsp;{(displayItems[0]?.price ?? 0).toLocaleString()}
                &nbsp;{currency || 'FCFA'}
              </span>
            </div>
          )}

          {/* ─── BOTTOM NAV ─── 4 tabs (BottomNav.tsx) */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '40px',
              backgroundColor: C.bg,
              borderTop: `1px solid ${C.divider}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-around',
              paddingLeft: '8px',
              paddingRight: '8px',
              zIndex: 40,
            }}
          >
            <Home style={{ width: '16px', height: '16px', color: C.text }} strokeWidth={2} />
            <ShoppingBag
              style={{ width: '16px', height: '16px', color: C.iconInactive }}
              strokeWidth={2}
            />
            <Clock
              style={{ width: '16px', height: '16px', color: C.iconInactive }}
              strokeWidth={2}
            />
            <User
              style={{ width: '16px', height: '16px', color: C.iconInactive }}
              strokeWidth={2}
            />
          </div>

          {/* Home indicator bar */}
          <div
            style={{
              position: 'absolute',
              bottom: '5px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '48px',
              height: '3px',
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
