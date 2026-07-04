/* eslint-disable @next/next/no-img-element */
'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown, MapPin, Search } from 'lucide-react';

import { C } from './tokens';

interface PhoneHeaderProps {
  logoUrl: string;
  initial: string;
}

export function PhoneHeader({ logoUrl, initial }: PhoneHeaderProps) {
  const t = useTranslations('onboarding');

  return (
    <>
      {/* Safe area top (dynamic island) */}
      <div style={{ height: '30px' }} />

      {/* --- HEADER --- location left / logo right */}
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
          <span style={{ fontSize: '8px', fontWeight: 600, color: C.text }}>
            {t('previewDineIn')}
          </span>
          <ChevronDown style={{ width: '8px', height: '8px', color: C.text }} strokeWidth={2} />
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

      {/* --- SEARCH BAR --- */}
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
          <Search style={{ width: '10px', height: '10px', color: C.textMuted }} strokeWidth={2} />
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
    </>
  );
}
