'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import type { Category } from '@/types/admin.types';
import { MENU_COLORS as C, tr } from '@/lib/tenant/menu-tokens';
import { getCategoryIcon } from '@/lib/config/category-icons';

interface CategoryGridProps {
  categories: Category[];
  lang: string;
  onSelect: (cat: Category) => void;
  onSeeAll: () => void;
  seeAllLabel: string;
}

export function CategoryGrid({
  categories,
  lang,
  onSelect,
  onSeeAll,
  seeAllLabel,
}: CategoryGridProps) {
  if (categories.length === 0) return null;
  const visible = categories.slice(0, 8);
  const hasMore = categories.length > 8;

  return (
    <div className="px-4">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {visible.map((cat) => {
          const label = tr(lang, cat.name, cat.name_en);
          return (
            <Button
              key={cat.id}
              variant="ghost"
              onClick={() => onSelect(cat)}
              className="flex flex-col items-center gap-1.5 px-0 py-0 h-auto active:scale-[0.97] transition-transform duration-150"
            >
              <div
                className="w-full aspect-square rounded-xl flex items-center justify-center"
                style={{ background: C.surfaceAlt }}
              >
                <Image
                  src={getCategoryIcon(cat.name)}
                  alt={label}
                  width={48}
                  height={48}
                  style={{ objectFit: 'contain' }}
                />
              </div>
              <span
                className="text-xs font-medium text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-full"
                style={{ color: C.textPrimary }}
              >
                {label}
              </span>
            </Button>
          );
        })}
      </div>
      {hasMore && (
        <Button
          variant="ghost"
          onClick={onSeeAll}
          className="block mt-3 mx-auto text-sm font-semibold px-0 h-auto"
          style={{ color: C.primary }}
        >
          {seeAllLabel}
        </Button>
      )}
    </div>
  );
}
