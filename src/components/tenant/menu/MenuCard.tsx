'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import type { Menu } from '@/types/admin.types';
import { MENU_COLORS as C, tr } from '@/lib/tenant/menu-tokens';

interface MenuCardProps {
  menu: Menu;
  lang: string;
  onClick: () => void;
}

export function MenuCard({ menu, lang, onClick }: MenuCardProps) {
  const name = tr(lang, menu.name, menu.name_en);
  const desc = tr(lang, menu.description || '', menu.description_en);
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="w-60 shrink-0 rounded-xl overflow-hidden px-0 py-0 text-left flex flex-col justify-start h-auto"
      style={{
        background: C.surface,
        border: `1px solid ${C.divider}`,
      }}
    >
      <div className="w-full h-[140px] relative" style={{ background: C.surfaceAlt }}>
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
            style={{ color: C.textMuted }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="py-3 px-3.5 pb-3.5">
        <p
          className="text-base font-bold m-0 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ color: C.textPrimary }}
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
