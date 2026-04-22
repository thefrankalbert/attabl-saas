'use client';

import Link from 'next/link';
import { Home, ShoppingBag, ClipboardList, User } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavKey = 'home' | 'cart' | 'orders' | 'account';

type NavItem = {
  key: NavKey;
  label: string;
  href: string;
  Icon: typeof Home;
  badge?: number;
};

type BottomNavRefonteProps = {
  activeKey: NavKey;
  slug: string;
  labels: Record<NavKey, string>;
  cartCount?: number;
  className?: string;
};

export function BottomNavRefonte({
  activeKey,
  slug,
  labels,
  cartCount = 0,
  className,
}: BottomNavRefonteProps) {
  const items: NavItem[] = [
    { key: 'home', label: labels.home, href: `/sites/${slug}`, Icon: Home },
    {
      key: 'cart',
      label: labels.cart,
      href: `/sites/${slug}/cart`,
      Icon: ShoppingBag,
      badge: cartCount,
    },
    {
      key: 'orders',
      label: labels.orders,
      href: `/sites/${slug}/orders`,
      Icon: ClipboardList,
    },
    {
      key: 'account',
      label: labels.account,
      href: `/sites/${slug}/settings`,
      Icon: User,
    },
  ];

  return (
    <nav
      data-slot="bottom-nav-refonte"
      aria-label={labels.home}
      className={cn(
        'absolute inset-x-0 bottom-0 z-30 flex justify-around border-t border-[color:var(--hair)] bg-[rgba(251,248,241,0.92)] px-3.5 pb-5 pt-2.5 backdrop-blur-[28px] [backdrop-filter:blur(28px)_saturate(180%)]',
        className,
      )}
    >
      {items.map(({ key, label, href, Icon, badge }) => {
        const isActive = activeKey === key;
        return (
          <Link
            key={key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex min-w-[60px] flex-col items-center gap-[3px] px-3 py-1 text-[10px] font-normal tracking-[0.01em] transition-colors min-h-[44px]',
              isActive
                ? 'font-bold text-[color:var(--navy)]'
                : 'text-[color:var(--ink-45)] hover:text-[color:var(--navy)]',
            )}
          >
            {isActive && (
              <span
                aria-hidden
                className="absolute -top-1 left-1/2 h-[2.5px] w-3.5 -translate-x-1/2 rounded-full bg-[color:var(--gold)]"
              />
            )}
            <span className="relative h-[22px] w-[22px]">
              <Icon className="h-[22px] w-[22px]" strokeWidth={1.7} aria-hidden />
              {typeof badge === 'number' && badge > 0 && (
                <span
                  aria-label={`${badge}`}
                  className="absolute -right-2 -top-[5px] inline-grid min-w-[18px] place-items-center rounded-full border-2 border-[color:var(--cream)] bg-[color:var(--navy)] px-[5px] text-[10px] font-extrabold leading-[18px] text-white"
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
