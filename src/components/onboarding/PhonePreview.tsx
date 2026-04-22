/* eslint-disable @next/next/no-img-element */
'use client';

import { useMemo } from 'react';
import { Search, ShoppingCart, Utensils } from 'lucide-react';

import type { OnboardingData } from '@/app/onboarding/page';

// ─── Emoji mapping (mirrors ClientMenuPage.tsx) ─────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

interface PhonePreviewProps {
  data: OnboardingData;
  phase: number;
}

/** Convert any hex color to rgba for safe gradient usage */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const bigint = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16,
  );
  if (isNaN(bigint)) return `rgba(26,26,46,${alpha})`;
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function PhonePreview({ data, phase }: PhonePreviewProps) {
  const { primaryColor, logoUrl, tenantName, menuItems, currency } = data;

  const safePrimary = /^#[0-9A-Fa-f]{3,8}$/.test(primaryColor || '') ? primaryColor : '#1a1a2e';

  // Unique categories derived from menu items
  const categories = useMemo(() => {
    if (!menuItems || menuItems.length === 0) return [];
    const seen = new Set<string>();
    const cats: Array<{ name: string; emoji: string }> = [];
    for (const item of menuItems) {
      const cat = item.category || 'Menu';
      if (!seen.has(cat)) {
        seen.add(cat);
        cats.push({ name: cat, emoji: getCategoryEmoji(cat) });
      }
    }
    return cats;
  }, [menuItems]);

  // Featured items (first 4 items with unique names)
  const featured = useMemo(() => {
    if (!menuItems || menuItems.length === 0) return [];
    return menuItems.slice(0, 4);
  }, [menuItems]);

  const hasMenu = phase >= 2 && menuItems && menuItems.length > 0;

  return (
    <div className="relative flex items-center justify-center">
      {/* Phone frame */}
      <div className="relative w-64 aspect-[1/2] rounded-[2.5rem] border-2 border-app-border bg-app-card overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-2xl z-10" />

        {/* Screen */}
        <div className="absolute inset-[2px] rounded-[2.3rem] overflow-hidden flex flex-col bg-white">
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto scrollbar-none">
            {/* ═══ GRADIENT HERO ═══ */}
            <div
              style={{
                background: `linear-gradient(180deg, ${hexToRgba(safePrimary, 1)} 0%, ${hexToRgba(safePrimary, 0.8)} 22%, ${hexToRgba(safePrimary, 0.53)} 40%, ${hexToRgba(safePrimary, 0.27)} 55%, ${hexToRgba(safePrimary, 0.13)} 68%, ${hexToRgba(safePrimary, 0.07)} 78%, ${hexToRgba(safePrimary, 0.03)} 86%, transparent 93%, #ffffff 100%)`,
                paddingTop: '32px',
                paddingBottom: '12px',
              }}
            >
              {/* Centered logo or tenant name */}
              <div className="flex justify-center px-4 mb-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={tenantName || 'Logo'}
                    className="h-5 w-auto max-w-35 object-contain"
                  />
                ) : (
                  <span
                    className="text-sm font-bold tracking-tight text-white"
                    style={{ color: '#ffffff' }}
                  >
                    {tenantName || 'Mon Restaurant'}
                  </span>
                )}
              </div>

              {/* Mini search bar */}
              <div className="px-4 mb-3">
                <div
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #d1d5db',
                  }}
                >
                  <Search
                    className="shrink-0"
                    style={{ width: '10px', height: '10px', color: '#9ca3af' }}
                    strokeWidth={1.5}
                  />
                  <span className="text-[10px] font-medium" style={{ color: '#9ca3af' }}>
                    Rechercher un plat...
                  </span>
                </div>
              </div>

              {/* Welcome text */}
              <div className="px-4 mb-2">
                <p className="text-[10px] font-bold leading-tight" style={{ color: '#ffffff' }}>
                  Découvrez notre carte
                </p>
              </div>
            </div>

            {/* ═══ CATEGORY EMOJI CIRCLES ═══ */}
            <div className="px-3 pt-1 pb-3" style={{ backgroundColor: '#ffffff' }}>
              {hasMenu && categories.length > 0 ? (
                <>
                  <p className="text-[10px] font-semibold mb-2" style={{ color: '#1f2937' }}>
                    Nos saveurs
                  </p>
                  <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                    {categories.slice(0, 6).map((cat) => (
                      <div
                        key={cat.name}
                        className="flex flex-col items-center shrink-0"
                        style={{ width: '36px' }}
                      >
                        <div
                          className="flex items-center justify-center rounded-full mb-0.5"
                          style={{
                            width: '30px',
                            height: '30px',
                            backgroundColor: '#f9fafb',
                            border: '1px solid #f3f4f6',
                          }}
                        >
                          <span style={{ fontSize: '14px', lineHeight: 1 }}>{cat.emoji}</span>
                        </div>
                        <span
                          className="text-center leading-tight truncate w-full"
                          style={{ fontSize: '6px', color: '#4b5563' }}
                        >
                          {cat.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Skeleton category circles */
                <>
                  <div
                    className="h-1.5 w-10 rounded-full mb-2"
                    style={{ backgroundColor: '#e5e7eb' }}
                  />
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex flex-col items-center" style={{ width: '36px' }}>
                        <div
                          className="rounded-full mb-0.5"
                          style={{
                            width: '30px',
                            height: '30px',
                            backgroundColor: '#f3f4f6',
                          }}
                        />
                        <div
                          className="rounded-full"
                          style={{
                            width: '24px',
                            height: '4px',
                            backgroundColor: '#f3f4f6',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ═══ FEATURED ITEMS (horizontal scroll cards) ═══ */}
            <div className="px-3 pb-3" style={{ backgroundColor: '#ffffff' }}>
              {hasMenu && featured.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold" style={{ color: '#1f2937' }}>
                      À ne pas manquer
                    </p>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: '#9ca3af' }}
                    >
                      Voir tout →
                    </span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                    {featured.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="shrink-0 rounded-lg overflow-hidden"
                        style={{
                          width: '80px',
                          border: '1px solid #e5e7eb',
                          backgroundColor: '#ffffff',
                        }}
                      >
                        {/* Image area */}
                        <div
                          className="flex items-center justify-center"
                          style={{
                            width: '80px',
                            height: '52px',
                            backgroundColor: '#f3f4f6',
                            overflow: 'hidden',
                          }}
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Utensils style={{ width: '14px', height: '14px', color: '#d1d5db' }} />
                          )}
                        </div>
                        {/* Text area */}
                        <div className="px-1.5 py-1">
                          <p
                            className="leading-tight truncate"
                            style={{
                              fontSize: '7px',
                              fontWeight: 600,
                              color: '#111827',
                              marginBottom: '1px',
                            }}
                          >
                            {item.name}
                          </p>
                          <p
                            className="font-bold"
                            style={{
                              fontSize: '7px',
                              color: '#C5A065',
                            }}
                          >
                            {item.price.toLocaleString()}&nbsp;{currency || 'FCFA'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* Skeleton featured cards */
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className="h-1.5 w-14 rounded-full"
                      style={{ backgroundColor: '#e5e7eb' }}
                    />
                    <div className="h-1 w-8 rounded-full" style={{ backgroundColor: '#f3f4f6' }} />
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="shrink-0 rounded-lg overflow-hidden"
                        style={{
                          width: '80px',
                          border: '1px solid #f3f4f6',
                        }}
                      >
                        <div
                          style={{
                            width: '80px',
                            height: '52px',
                            backgroundColor: '#f3f4f6',
                          }}
                        />
                        <div className="px-1.5 py-1.5">
                          <div
                            className="rounded-full mb-1"
                            style={{
                              height: '4px',
                              width: `${50 + i * 15}%`,
                              backgroundColor: '#e5e7eb',
                            }}
                          />
                          <div
                            className="rounded-full"
                            style={{
                              height: '4px',
                              width: '40%',
                              backgroundColor: '#f3f4f6',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ═══ "SEE FULL MENU" CTA ═══ */}
            <div className="px-3 pb-3" style={{ backgroundColor: '#ffffff' }}>
              <div
                className="flex items-center justify-center gap-1 rounded-lg py-2"
                style={{
                  backgroundColor: safePrimary,
                  color: '#ffffff',
                }}
              >
                <Utensils style={{ width: '8px', height: '8px' }} />
                <span className="text-[10px] font-bold">Voir le menu complet</span>
              </div>
            </div>

            {/* Bottom spacer for floating bar */}
            <div className="h-8" />
          </div>

          {/* ═══ FLOATING CART BAR (teal) ═══ */}
          <div
            className="absolute left-2 right-2 flex items-center justify-center gap-1.5 rounded-xl py-1.5"
            style={{
              bottom: '16px',
              backgroundColor: '#14b8a6',
            }}
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: '16px',
                height: '16px',
                backgroundColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <ShoppingCart style={{ width: '8px', height: '8px', color: '#ffffff' }} />
            </div>
            <span className="font-semibold" style={{ fontSize: '7px', color: '#ffffff' }}>
              Votre panier
            </span>
          </div>

          {/* Home indicator */}
          <div
            className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full"
            style={{
              width: '60px',
              height: '3px',
              backgroundColor: 'rgba(0,0,0,0.15)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
