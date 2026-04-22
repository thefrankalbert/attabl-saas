'use client';

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
      <div className="grid grid-cols-4 gap-3">
        {visible.map((cat) => {
          const label = tr(lang, cat.name, cat.name_en);
          return (
            <Button
              key={cat.id}
              variant="ghost"
              onClick={() => onSelect(cat)}
              className="flex flex-col items-center gap-1.5 px-0 py-0 h-auto"
            >
              <div
                className="w-full aspect-square rounded-xl flex items-center justify-center"
                style={{ background: C.surfaceAlt }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getCategoryIcon(cat.name)}
                  alt={label}
                  width={56}
                  height={56}
                  style={{ width: 56, height: 56, objectFit: 'contain' }}
                  loading="lazy"
                />
              </div>
              <span
                className="text-[11px] font-medium text-center overflow-hidden text-ellipsis whitespace-nowrap max-w-full"
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
