'use client';

import { useTranslations } from 'next-intl';
import { ShoppingBag } from 'lucide-react';

import { C, type PhoneMenuItem } from './tokens';

interface PhoneCartBarProps {
  displayItems: PhoneMenuItem[];
  currency: string;
}

export function PhoneCartBar({ displayItems, currency }: PhoneCartBarProps) {
  const t = useTranslations('onboarding');

  return (
    /* --- FLOATING CART BAR --- noir, rounded-full (FloatingCartBar.tsx) */
    <div
      style={{
        position: 'absolute',
        left: '10px',
        right: '10px',
        bottom: '44px',
        height: '30px',
        backgroundColor: C.cartBg,
        borderRadius: '999px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        zIndex: 30,
        boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
      }}
    >
      <ShoppingBag style={{ width: '11px', height: '11px', color: C.cartText }} strokeWidth={2} />
      <span
        style={{
          fontSize: '8px',
          fontWeight: 600,
          color: C.cartText,
          whiteSpace: 'nowrap',
        }}
      >
        {t('previewViewCart')}
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
        {displayItems.length}&nbsp;-&nbsp;{(displayItems[0]?.price ?? 0).toLocaleString()}
        &nbsp;{currency || 'FCFA'}
      </span>
    </div>
  );
}
