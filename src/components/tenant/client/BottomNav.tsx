'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, UtensilsCrossed, ShoppingBag, Clock, User } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCartData } from '@/contexts/CartContext';
import { formatCartCount } from '@/lib/utils/cart-display';

type TabKey = 'home' | 'menu' | 'cart' | 'orders' | 'account';

interface TabDef {
  key: TabKey;
  href: (slug: string) => string;
  Icon: React.ComponentType<LucideProps>;
  match: (path: string) => boolean;
  badge?: boolean;
}

const TAB_DEFS: TabDef[] = [
  {
    key: 'home',
    href: (s) => `/sites/${s}`,
    Icon: Home,
    match: (p) => /\/sites\/[^/]+\/?$/.test(p),
  },
  {
    key: 'menu',
    href: (s) => `/sites/${s}/menu`,
    Icon: UtensilsCrossed,
    match: (p) => p.includes('/menu') || p.includes('/categories'),
  },
  {
    key: 'cart',
    href: (s) => `/sites/${s}/cart`,
    Icon: ShoppingBag,
    match: (p) => p.includes('/cart') || p.includes('/panier'),
    badge: true,
  },
  {
    key: 'orders',
    href: (s) => `/sites/${s}/orders`,
    Icon: Clock,
    match: (p) => p.includes('/orders') || p.includes('/commandes'),
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

  // Splash is a full-screen pre-entry experience - no tab bar.
  if (path.endsWith('/welcome')) return null;

  return (
    <nav
      aria-label={t('navLabel')}
      className="relative z-30 border-t border-[var(--color-divider)] bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid h-16 grid-cols-5">
        {TAB_DEFS.map((tab) => {
          const active = tab.match(path);
          return (
            <Link
              key={tab.key}
              href={tab.href(slug)}
              className="relative flex flex-col items-center justify-center gap-1"
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative">
                <tab.Icon
                  className={active ? 'text-[var(--color-brand)]' : 'text-[var(--color-ink-muted)]'}
                  width={22}
                  height={22}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                {tab.badge && totalItems > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-white bg-[var(--color-brand)] px-1 text-[10px] font-bold tabular-nums text-white">
                    {formatCartCount(totalItems)}
                  </span>
                )}
              </span>
              <span
                className={`text-[10.5px] tracking-[-0.1px] ${active ? 'font-semibold text-[var(--color-brand)]' : 'font-medium text-[var(--color-ink-muted)]'}`}
              >
                {t(tab.key)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
