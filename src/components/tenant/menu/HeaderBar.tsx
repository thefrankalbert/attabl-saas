'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { MENU_COLORS as C } from '@/lib/tenant/menu-tokens';

interface HeaderBarProps {
  locationName: string;
  logoUrl: string | null;
  tenantName: string;
  onLocationPress: () => void;
  onAvatarPress: () => void;
}

export function HeaderBar({
  locationName,
  logoUrl,
  tenantName,
  onLocationPress,
  onAvatarPress,
}: HeaderBarProps) {
  return (
    <div
      className="h-14 px-4 flex items-center justify-between"
      style={{ background: C.background }}
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
        <span className="text-[15px] font-semibold" style={{ color: C.textPrimary }}>
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
        style={{ background: C.surfaceAlt }}
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
            style={{ color: C.textMuted }}
          >
            {tenantName.charAt(0).toUpperCase()}
          </span>
        )}
      </Button>
    </div>
  );
}
