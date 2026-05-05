import Link from 'next/link';
import { CategoryIcon } from './CategoryIcon';
import type { CategoryIconKey } from './CategoryIcon';

export interface ClientCategory {
  id: string;
  label: string;
  icon: CategoryIconKey;
  bgColor?: string;
  fgColor?: string;
}

export interface CategoryTileProps {
  category: ClientCategory;
  href: string;
}

export function CategoryTile({ category, href }: CategoryTileProps) {
  const bg = category.bgColor ?? 'oklch(0.965 0.005 90)';
  const fg = category.fgColor ?? 'oklch(0.65 0.015 80)';

  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2"
      aria-label={`Voir ${category.label}`}
    >
      <div
        className="relative w-full overflow-hidden rounded-[var(--radius-card)] transition-transform group-active:scale-95"
        style={{
          aspectRatio: '1 / 1',
          backgroundColor: bg,
          border: '1px solid oklch(0.92 0.002 286)',
        }}
      >
        <div className="flex h-full w-full items-center justify-center" style={{ color: fg }}>
          <CategoryIcon name={category.icon} size={30} />
        </div>
      </div>
      <div className="w-full truncate text-center text-[11.5px] font-medium text-[var(--color-ink-2)]">
        {category.label}
      </div>
    </Link>
  );
}
