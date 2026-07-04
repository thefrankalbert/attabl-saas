'use client';

import { useMemo } from 'react';

import type { OnboardingData } from '@/app/onboarding/page';

import { getCategoryEmoji } from './utils/category-emojis';
import { C } from './phone/tokens';
import { PhoneHeader } from './phone/PhoneHeader';
import { PhoneCategories } from './phone/PhoneCategories';
import { PhoneCategoryNav } from './phone/PhoneCategoryNav';
import { PhoneMenuItems } from './phone/PhoneMenuItems';
import { PhoneCartBar } from './phone/PhoneCartBar';
import { PhoneBottomNav } from './phone/PhoneBottomNav';

// --- Types ------------------------------------------------------------------

interface PhonePreviewProps {
  data: OnboardingData;
  phase: number;
}

// --- Component --------------------------------------------------------------

export function PhonePreview({ data, phase }: PhonePreviewProps) {
  const { logoUrl, tenantName, menuItems, currency } = data;

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

  const displayItems = useMemo(() => (menuItems ?? []).slice(0, 5), [menuItems]);

  const hasMenu = phase >= 2 && menuItems && menuItems.length > 0;
  const initial = (tenantName || 'M').charAt(0).toUpperCase();

  return (
    <div className="relative flex items-center justify-center">
      {/* -- Phone shell ------------------------------- */}
      <div
        style={{
          position: 'relative',
          width: '256px',
          height: '512px',
          borderRadius: '40px',
          border: '2px solid #D1D5DB',
          backgroundColor: '#000',
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06) inset',
        }}
      >
        {/* Dynamic island */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '64px',
            height: '16px',
            backgroundColor: '#000',
            borderRadius: '999px',
            zIndex: 20,
          }}
        />

        {/* -- Screen ---------------------------------- */}
        <div
          style={{
            position: 'absolute',
            inset: '2px',
            borderRadius: '38px',
            backgroundColor: C.bg,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* -- Scrollable content -------------------- */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            <PhoneHeader logoUrl={logoUrl} initial={initial} />

            <PhoneCategories hasMenu={!!hasMenu} categories={categories} />

            <PhoneCategoryNav hasMenu={!!hasMenu} categories={categories} />

            <PhoneMenuItems hasMenu={!!hasMenu} displayItems={displayItems} currency={currency} />

            {/* Spacer bottom (cart bar + bottom nav) */}
            <div style={{ height: '90px' }} />
          </div>

          {hasMenu && <PhoneCartBar displayItems={displayItems} currency={currency} />}

          <PhoneBottomNav />
        </div>
      </div>
    </div>
  );
}
