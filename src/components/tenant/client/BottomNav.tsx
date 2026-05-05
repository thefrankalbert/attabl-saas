'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, UtensilsCrossed, ShoppingBag, ClipboardList, User } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCartData } from '@/contexts/CartContext';

interface RegularTabDef {
  isCenter?: false;
  key: string;
  href: (slug: string) => string;
  Icon: React.ComponentType<LucideProps>;
  match: (path: string) => boolean;
}

interface CenterTabDef {
  isCenter: true;
  key: string;
  href: (slug: string) => string;
  match: (path: string) => boolean;
}

type TabDef = RegularTabDef | CenterTabDef;

const TAB_DEFS: TabDef[] = [
  {
    key: 'home',
    href: (s) => `/sites/${s}`,
    Icon: Home,
    match: (p) => /\/sites\/[^/]+\/?$/.test(p),
  },
  {
    key: 'orders',
    href: (s) => `/sites/${s}/orders`,
    Icon: ClipboardList,
    match: (p) => p.includes('/orders') || p.includes('/commandes'),
  },
  {
    isCenter: true,
    key: 'cart',
    href: (s) => `/sites/${s}/cart`,
    match: (p) => p.includes('/cart') || p.includes('/panier'),
  },
  {
    key: 'menu',
    href: (s) => `/sites/${s}/menu`,
    Icon: UtensilsCrossed,
    match: (p) => p.includes('/menu') || p.includes('/categories'),
  },
  {
    key: 'account',
    href: (s) => `/sites/${s}/settings`,
    Icon: User,
    match: (p) => p.includes('/settings') || p.includes('/compte'),
  },
];

export function ClientBottomNav({ slug }: { slug: string }) {
  const path = usePathname() ?? '';
  const { totalItems } = useCartData();
  const t = useTranslations('bottomNav');

  return (
    <nav
      aria-label={t('navLabel')}
      className="relative z-30 border-t border-[var(--color-divider)] bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid h-16 grid-cols-5">
        {TAB_DEFS.map((tab) => {
          const active = tab.match(path);

          if (tab.isCenter) {
            return (
              <Link
                key={tab.key}
                href={tab.href(slug)}
                className="flex flex-col items-center justify-end pb-3"
                aria-label={t('cart')}
              >
                <div className="-translate-y-3.5 relative">
                  <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-[var(--color-ink)] shadow-[0_0_0_4px_white,0_4px_6px_-1px_rgba(0,0,0,0.08)]">
                    <ShoppingBag className="text-white" width={22} height={22} strokeWidth={2} />
                  </div>
                  {totalItems > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand)] px-1 font-mono text-[10.5px] font-bold text-[var(--color-ink)]">
                      {totalItems}
                    </span>
                  )}
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={tab.key}
              href={tab.href(slug)}
              className="relative flex flex-col items-center justify-center gap-1"
              aria-current={active ? 'page' : undefined}
            >
              <tab.Icon
                className={active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}
                width={20}
                height={20}
                strokeWidth={active ? 2 : 1.8}
              />
              <span
                className={`text-[10.5px] ${active ? 'font-semibold text-[var(--color-ink)]' : 'font-medium text-[var(--color-ink-muted)]'}`}
              >
                {t(tab.key as 'home' | 'orders' | 'menu' | 'account')}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
