import Link from 'next/link';
import { Photo } from '@/components/tenant/client/Photo';
import { CategoryIcon } from './CategoryIcon';

export interface ClientCategory {
  id: string;
  label: string;
  icon: string;
  bgColor?: string;
  fgColor?: string;
  coverUrl?: string | null;
}

export interface CategoryTileProps {
  category: ClientCategory;
  href: string;
}

export function CategoryTile({ category, href }: CategoryTileProps) {
  const base = category.fgColor ?? 'oklch(0.5 0.08 80)';
  const hasCover = Boolean(category.coverUrl);

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
          // Gradient background is only the fallback canvas for the icon; when a
          // cover photo exists it fills the tile and no gradient/icon shows.
          background: hasCover
            ? undefined
            : `linear-gradient(155deg, color-mix(in oklab, ${base}, white 22%) 0%, ${base} 52%, color-mix(in oklab, ${base}, black 16%) 100%)`,
        }}
      >
        {hasCover ? (
          <Photo
            src={category.coverUrl ?? null}
            alt={category.label}
            kind="food"
            fill
            sizes="25vw"
          />
        ) : (
          <CategoryIcon name={category.icon} size={30} className="text-white" />
        )}
      </div>
      <div className="w-full truncate text-center text-[11.5px] font-medium text-[var(--color-ink-2)]">
        {category.label}
      </div>
    </Link>
  );
}
