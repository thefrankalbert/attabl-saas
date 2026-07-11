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
          background: `linear-gradient(155deg, color-mix(in oklab, ${base}, white 22%) 0%, ${base} 52%, color-mix(in oklab, ${base}, black 16%) 100%)`,
        }}
      >
        {hasCover && (
          <div className="absolute inset-0">
            <Photo
              src={category.coverUrl ?? null}
              alt={category.label}
              kind="food"
              fill
              sizes="25vw"
            />
            <div className="absolute inset-0 bg-black/30" />
          </div>
        )}
        <CategoryIcon
          name={category.icon}
          size={30}
          className={
            hasCover ? 'relative text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]' : 'text-white'
          }
        />
      </div>
      <div className="w-full truncate text-center text-[11.5px] font-medium text-[var(--color-ink-2)]">
        {category.label}
      </div>
    </Link>
  );
}
