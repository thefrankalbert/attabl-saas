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
  const base = category.fgColor ?? 'oklch(0.5 0.08 80)';

  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2"
      aria-label={category.label}
    >
      <div
        className="relative flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-card)] transition-transform group-active:scale-95"
        style={{
          aspectRatio: '1 / 1',
          background: `linear-gradient(155deg, color-mix(in oklab, ${base}, white 22%) 0%, ${base} 52%, color-mix(in oklab, ${base}, black 16%) 100%)`,
        }}
      >
        <CategoryIcon name={category.icon} size={30} className="text-white" />
      </div>
      <div className="w-full truncate text-center text-[11.5px] font-medium text-[var(--color-ink-2)]">
        {category.label}
      </div>
    </Link>
  );
}
