'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Plus, Star } from 'lucide-react';
import { formatAmount } from '@/lib/utils/currency';
import { Badge } from '@/components/ui/badge';
import { Photo } from './Photo';
import { Rating } from './Rating';

interface ClientBadge {
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
  /** Navigation target (used when the card is not interactive). */
  href?: string;
  variant?: 'list' | 'featured';
  /** Tenant currency code (XAF/XOF render as "FCFA", others show the code). */
  currencyCode?: string;
  /** Interactive mode: tap the card to open the item detail. */
  onOpen?: () => void;
  /** Cart-aware "+"/stepper control (interactive mode). Positions itself. */
  addControl?: ReactNode;
}

const PLUS_SHADOW =
  'shadow-[0_4px_6px_-1px_rgba(26,26,26,0.06),0_2px_4px_-2px_rgba(26,26,26,0.04)]';

// XAF and XOF are both known to users as "FCFA"; other ISO codes show as-is.
function currencyUnit(code: string): string {
  return code === 'XAF' || code === 'XOF' ? 'FCFA' : code;
}

export function MenuItemCard({
  item,
  href,
  variant = 'list',
  currencyCode = 'XAF',
  onOpen,
  addControl,
}: Props) {
  const unit = currencyUnit(currencyCode);
  const interactive = typeof onOpen === 'function';

  // The "+" affordance: the cart-aware control in interactive mode (positions
  // itself), a decorative "+" otherwise (navigation cards).
  const plusSlot = (className: string) =>
    addControl ?? (
      <div
        aria-hidden
        className={`${className} flex items-center justify-center rounded-full bg-white ${PLUS_SHADOW}`}
      >
        <Plus className="h-[18px] w-[18px] text-[var(--color-ink)]" strokeWidth={2.6} />
      </div>
    );

  // Outer wrapper: clickable region (interactive) or navigation Link. The
  // interactive card is a plain onClick div (no role=button) so it never wraps
  // the "+" button as nested interactive content - matching the menu card.
  const wrap = (className: string, children: ReactNode) =>
    interactive ? (
      <div onClick={onOpen} className={`${className} cursor-pointer`}>
        {children}
      </div>
    ) : (
      <Link href={href ?? '#'} className={className}>
        {children}
      </Link>
    );

  if (variant === 'featured') {
    return wrap(
      'block w-[200px] shrink-0',
      <>
        <div className="relative h-[140px] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)]">
          <Photo
            src={item.photoUrl}
            alt={item.name}
            kind={item.isDrink ? 'drink' : 'food'}
            fill
            sizes="200px"
          />
          {item.badges?.[0] && (
            <span className="absolute left-2 top-2">
              <ItemBadge kind={item.badges[0].kind} label={item.badges[0].label} />
            </span>
          )}
          {plusSlot('absolute bottom-2 right-2 h-[34px] w-[34px]')}
        </div>
        <div className="px-0.5 pt-2.5">
          <div className="truncate text-[13.5px] font-semibold leading-[1.3] tracking-[-0.2px] text-[var(--color-ink)]">
            {item.name}
          </div>
          <div className="mt-[5px] flex items-center gap-2">
            <span className="text-[13.5px] font-bold tabular-nums text-[var(--color-ink)]">
              {formatAmount(item.price, currencyCode)}{' '}
              <span className="font-mono text-[10px] font-medium text-[var(--color-ink-muted)]">
                {unit}
              </span>
            </span>
            {item.rating != null && <Rating value={item.rating} size={11} />}
          </div>
        </div>
      </>,
    );
  }

  return wrap(
    'flex items-stretch gap-3.5 border-b border-[var(--color-divider)] py-[15px]',
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        {item.badges && item.badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-[5px]">
            {item.badges.map((b, i) => (
              <ItemBadge key={i} kind={b.kind} label={b.label} />
            ))}
          </div>
        )}
        <div className="truncate text-[15.5px] font-semibold leading-[1.3] tracking-[-0.3px] text-[var(--color-ink)]">
          {item.name}
        </div>
        {item.description && (
          <p className="line-clamp-1 text-[12.5px] leading-[1.4] text-[var(--color-ink-muted)]">
            {item.description}
          </p>
        )}
        <div className="mt-auto flex items-center gap-2.5 pt-1">
          <span className="text-[14.5px] font-bold tabular-nums text-[var(--color-ink)]">
            {formatAmount(item.price, currencyCode)}{' '}
            <span className="font-mono text-[10px] font-medium text-[var(--color-ink-muted)]">
              {unit}
            </span>
          </span>
          {item.oldPrice && (
            <span className="text-[12.5px] tabular-nums text-[var(--color-ink-soft)] line-through">
              {formatAmount(item.oldPrice, currencyCode)}
            </span>
          )}
          {item.rating != null && (
            <span className="inline-flex items-center gap-[3px] text-[12px] font-medium text-[var(--color-ink-muted)]">
              <Star
                className="text-[var(--color-rating)]"
                style={{ width: 11, height: 11 }}
                fill="currentColor"
                strokeWidth={0}
              />
              {item.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div className="relative shrink-0">
        <div className="relative h-[104px] w-[104px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-divider)]">
          <Photo
            src={item.photoUrl}
            alt={item.name}
            kind={item.isDrink ? 'drink' : 'food'}
            fill
            sizes="104px"
          />
        </div>
        {plusSlot('absolute -bottom-1.5 -right-1.5 h-[34px] w-[34px]')}
      </div>
    </>,
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
      'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)] hover:bg-[var(--color-warning-bg)]',
    new: 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)]',
    spicy: 'bg-[#fff0ee] text-[var(--color-promo)] hover:bg-[#fff0ee]',
  };
  return (
    <Badge
      className={`${clsMap[kind]} rounded-[var(--radius-tag)] px-2 py-[3px] text-[10.5px] font-semibold tracking-[0.1px]`}
    >
      {label}
    </Badge>
  );
}
