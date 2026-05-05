import Link from 'next/link';
import { Plus } from 'lucide-react';
import { fmtFCFA } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Photo } from './Photo';
import { Rating } from './Rating';

export interface ClientBadge {
  kind: 'promo' | 'new' | 'popular' | 'spicy';
  label: string;
}

export interface ClientMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  oldPrice?: number | null;
  photoUrl?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  badges?: ClientBadge[];
  isDrink?: boolean;
  isAvailable: boolean;
}

interface Props {
  item: ClientMenuItem;
  href: string;
  variant?: 'list' | 'featured';
}

export function MenuItemCard({ item, href, variant = 'list' }: Props) {
  if (variant === 'featured') {
    return (
      <Link
        href={href}
        className="block w-44 shrink-0 rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white"
      >
        <div className="relative h-32 w-full overflow-hidden rounded-t-[var(--radius-card)]">
          <Photo
            src={item.photoUrl}
            alt={item.name}
            kind={item.isDrink ? 'drink' : 'food'}
            fill
            sizes="176px"
          />
          {item.badges?.[0] && (
            <span className="absolute left-2 top-2">
              <ItemBadge kind={item.badges[0].kind} label={item.badges[0].label} />
            </span>
          )}
          <div
            aria-hidden
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-divider)] bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]"
          >
            <Plus className="h-[15px] w-[15px] text-[var(--color-ink)]" strokeWidth={2.2} />
          </div>
        </div>
        <div className="p-3">
          <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--color-ink)]">
            {item.name}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[15px] font-bold text-[var(--color-ink)]">
              {fmtFCFA(item.price)}
            </span>
            {item.rating != null && <Rating value={item.rating} />}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-stretch gap-3 rounded-[var(--radius-card)] border border-[var(--color-divider)] bg-white p-3"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.badges?.[0] && (
            <ItemBadge kind={item.badges[0].kind} label={item.badges[0].label} />
          )}
          {item.rating != null && <Rating value={item.rating} count={item.ratingCount} />}
        </div>
        <div className="mt-1 line-clamp-1 text-[16px] font-semibold leading-snug text-[var(--color-ink)]">
          {item.name}
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--color-ink-muted)]">
            {item.description}
          </p>
        )}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[15px] font-bold text-[var(--color-ink)]">
            {fmtFCFA(item.price)}
          </span>
          {item.oldPrice && (
            <span className="text-[12px] text-[var(--color-ink-soft)] line-through">
              {fmtFCFA(item.oldPrice)}
            </span>
          )}
        </div>
      </div>
      <div className="relative h-24 w-24 shrink-0">
        <div className="h-24 w-24 overflow-hidden rounded-[var(--radius-tag)] border border-[var(--color-divider)]">
          <Photo
            src={item.photoUrl}
            alt={item.name}
            kind={item.isDrink ? 'drink' : 'food'}
            fill
            sizes="96px"
          />
        </div>
        <div
          aria-hidden
          className="absolute -bottom-1.5 -right-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-white bg-[var(--color-ink)] shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]"
        >
          <Plus className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
        </div>
      </div>
    </Link>
  );
}

function ItemBadge({
  kind,
  label,
}: {
  kind: 'promo' | 'new' | 'popular' | 'spicy';
  label: string;
}) {
  const clsMap: Record<typeof kind, string> = {
    promo: 'bg-[var(--color-promo)] text-white hover:bg-[var(--color-promo)]',
    popular:
      'bg-[var(--color-brand-light)] text-[var(--color-brand-dark)] hover:bg-[var(--color-brand-light)]',
    new: 'bg-[var(--color-ink)] text-white hover:bg-[var(--color-ink)]',
    spicy:
      'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)] hover:bg-[var(--color-warning-bg)]',
  };
  return (
    <Badge
      className={`${clsMap[kind]} rounded-[var(--radius-tag)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.5px]`}
    >
      {label}
    </Badge>
  );
}
