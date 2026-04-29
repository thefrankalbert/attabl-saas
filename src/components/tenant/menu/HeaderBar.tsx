'use client';

import Image from 'next/image';
import { ChevronDown, MapPin } from 'lucide-react';
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
        <MapPin size={16} fill={C.primary} stroke="none" aria-hidden />
        <span className="text-[15px] font-semibold" style={{ color: C.textPrimary }}>
          {locationName}
        </span>
        <ChevronDown size={12} color={C.textPrimary} strokeWidth={2} aria-hidden />
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
            className="w-full h-full object-cover"
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
